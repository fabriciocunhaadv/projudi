// Contagem LOCAL de uso da extensão (só números por dia e recurso, nunca conteúdo de processo). Fica em chrome.storage.local "uso_ext";
// o script do Studio (studio-base.js) entrega ao app, que envia ao servidor (painel Super Admin → Utilização).
export const diaDeHoje = () => { const d = new Date(), z = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
export async function contarUso(recurso, n = 1) {
  try {
    const gravar = async () => {
      const { uso_ext = {} } = await chrome.storage.local.get("uso_ext"), d = diaDeHoje();
      uso_ext[d] = uso_ext[d] || {}; uso_ext[d][recurso] = (uso_ext[d][recurso] || 0) + n;
      for (const k of Object.keys(uso_ext).sort().slice(0, -30)) delete uso_ext[k];      // guarda no máximo 30 dias sem entregar
      await chrome.storage.local.set({ uso_ext });
    };
    await (navigator.locks ? navigator.locks.request("uso-ext", gravar) : gravar());
  } catch { /* contar nunca atrapalha o que a pessoa está fazendo */ }
}
