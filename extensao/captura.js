(async () => {
  const { captura = "" } = await chrome.storage.local.get("captura");
  const t = document.getElementById("txt");
  t.value = captura;
  document.getElementById("info").textContent = `${Math.round(captura.length / 1000)} mil caracteres`;
  document.getElementById("copiar").onclick = async () => {
    t.select();
    await navigator.clipboard.writeText(captura);
    document.getElementById("info").textContent = "Copiado! Cole no chat.";
  };
})();
