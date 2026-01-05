const seed = Math.random().toString(16).slice(2, 10).toUpperCase();
document.getElementById("seed").textContent = `seed: ${seed}  |  build: unfinished`;

document.getElementById("glitch").addEventListener("click", () => {
  document.body.style.filter = `hue-rotate(${Math.floor(Math.random()*360)}deg)`;
  setTimeout(() => (document.body.style.filter = ""), 250);
});
