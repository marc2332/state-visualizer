import { extractMachinesFromFile } from '@xstate/machine-extractor';
import { forEachEntity } from '@xstate/tools-shared';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { inlineConstants } from './inline.js';

const INLINE = '__@@INLINE_IMPLEMENTATION@@__';
const $ = (id) => document.getElementById(id);
let machines = [];

// Same conversion the extension's language server does before sending a config to the editor.
const toEditorConfig = (machine) => {
  const config = JSON.parse(JSON.stringify(machine.toConfig()));
  forEachEntity(config, (entity) => {
    if (entity && 'src' in entity && entity.src !== undefined) {
      return { ...entity, src: entity.kind === 'inline' ? INLINE : entity.src };
    }
    if (entity && 'action' in entity && entity.action !== undefined) {
      return entity.kind === 'named' ? entity.action : INLINE;
    }
    return entity?.kind === 'named' ? entity.type : INLINE;
  });
  return config;
};

const show = (machine) => {
  const params = new URLSearchParams({
    runningInStatelyExtension: 'true',
    config: compressToEncodedURIComponent(JSON.stringify(toEditorConfig(machine))),
    themeKind: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  });
  const layout = machine.getLayoutComment()?.value;
  if (layout) params.set('layout', layout);
  $('editor').src = `editor/index.html?${params}`;
};

const render = () => {
  $('error').textContent = '';
  history.replaceState(null, '', `#${compressToEncodedURIComponent($('code').value)}`);
  try {
    machines = extractMachinesFromFile(inlineConstants($('code').value))?.machines.filter(Boolean) ?? [];
  } catch (e) {
    $('error').textContent = e.message;
    return;
  }
  if (!machines.length) {
    $('error').textContent = 'No machines found';
    return;
  }
  $('machine').hidden = machines.length < 2;
  $('machine').innerHTML = machines
    .map((m, i) => `<option value="${i}">${m.toConfig().id ?? `Machine ${i + 1}`}</option>`)
    .join('');
  show(machines[0]);
};

$('file').onchange = async (e) => {
  $('code').value = await e.target.files[0].text();
  render();
};
$('render').onclick = render;
$('machine').onchange = (e) => show(machines[e.target.value]);
const setSidebar = (hidden) => {
  document.querySelector('aside').hidden = hidden;
  $('toggle').textContent = hidden ? '›' : '‹';
  const url = new URL(location.href);
  if (hidden) url.searchParams.set('sidebar', 'closed');
  else url.searchParams.delete('sidebar');
  history.replaceState(null, '', url);
};
$('toggle').onclick = () => setSidebar(!document.querySelector('aside').hidden);
setSidebar(new URLSearchParams(location.search).get('sidebar') === 'closed');

const shared = decompressFromEncodedURIComponent(location.hash.slice(1));
if (shared) {
  $('code').value = shared;
  render();
}
