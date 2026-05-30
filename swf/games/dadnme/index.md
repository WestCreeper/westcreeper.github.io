---
layout: page
title: Dad 'n Me
permalink: /swf/games/dadnme/
---

# The Heist 2

## 游戏信息

- 类型：Flash Game
- 作者：DanPaladin
- 年代：2000s
- 状态：可运行（Ruffle）
- 原作链接：https://www.newgrounds.com/portal/view/254456
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
   
    const swfUrl = "/swf/games/dadnme/dadnme.swf";
    player.load(swfUrl);
});
</script>

---

## 📦 游戏说明

程序设计：Tom Fulp

美术设计：Dan Paladin

按 Q 键切换画质。部分用户可能需要将画质调至“低”。

A = 轻击

S = 重击

方向键 = 行走

尝试不同的连击系统，尽可能高效地击杀敌人。在城里的贫民窟与父亲会面。

我提前 30 分钟提交了此版本，作为一份特别的礼物。
---

## 🧠 备注
