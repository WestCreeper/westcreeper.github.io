---
layout: page
title: Example Game
permalink: /archive/games/example-game/
---

# Example Game

## 游戏信息

- 类型：Flash Game
- 作者：Unknown
- 年代：2000s
- 状态：可运行（Ruffle）

---

## 🎮 在线游玩

<div id="ruffle-container"></div>

<script src="https://unpkg.com/@ruffle-rs/ruffle"></script>

<script>
window.RufflePlayer = window.RufflePlayer || {};
window.addEventListener("load", () => {
    const ruffle = window.RufflePlayer.newest();
    const player = ruffle.createPlayer();
    const container = document.getElementById("ruffle-container");
    container.appendChild(player);

    player.style.width = "800px";
    player.style.height = "600px";

    player.load("game.swf");
});
</script>

---

## 📦 游戏说明

这里写游戏玩法说明。

---

## 🧠 备注

- 使用 Ruffle 播放
- 兼容 ActionScript 1/2/3（部分）