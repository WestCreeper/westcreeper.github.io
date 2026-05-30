window.loadRuffle = function (containerId, swfPath) {
    window.RufflePlayer = window.RufflePlayer || {};

    const ruffle = window.RufflePlayer.newest();
    const player = ruffle.createPlayer();

    const container = document.getElementById(containerId);
    container.appendChild(player);

    player.style.width = "800px";
    player.style.height = "600px";

    player.load(swfPath);
};