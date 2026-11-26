'use strict';

const Art = (() => {
  const rock = ['#393a36', '#54554e', '#696963', '#828176', '#989486'];
  const green = ['#2d472c', '#416032', '#658844', '#8eaa58', '#bdd080'];
  const wood = ['#30271e', '#544031', '#79583d', '#ae7c48', '#d5a668'];
  const metal = ['#242c2b', '#394749', '#586b6c', '#839895', '#b9c7b1'];
  const gold = ['#5f3925', '#916036', '#cb8d44', '#f5bd61', '#ffe0a2'];
  const jade = ['#214c44', '#30786a', '#68b5a0', '#a5e5c1', '#e0ffd8'];
  const violet = ['#463653', '#66477d', '#9371ad', '#c39ce3', '#f0caff'];
  const coal = ['#202523', '#2d3432', '#404942', '#5c6459', '#7c8776'];
  const ores = {
    stone: rock, coal, copper: ['#58342b', '#864635', '#bb664c', '#e58d63', '#f6b484'],
    jade, amber: gold, core: violet
  };
  const pickTints = [wood, metal, gold, jade, violet];
  const palettes = [
    ['#7697a6', '#9eb4a3', '#afbc91', '#84955a', '#64764f', '#202721', '#332f28', '#51483b'],
    ['#627b82', '#80988e', '#9ca878', '#757e57', '#5a6240', '#242823', '#373831', '#555442'],
    ['#996f60', '#c3976f', '#c7a26c', '#9d734a', '#745444', '#312522', '#45302b', '#624339'],
    ['#456e79', '#68968d', '#93b29a', '#5e8b73', '#426a60', '#18282a', '#263b37', '#42564a'],
    ['#575172', '#747095', '#a194a6', '#685874', '#52465d', '#211c2c', '#33293c', '#4d3e51']
  ];
  const slots = [180, 240, 300];

  function rect(ctx, color, x, y, width, height) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), width, height);
  }

  function poly(ctx, color, points) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.closePath();
    ctx.fill();
  }

  function randomFrom(seed) {
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  function cube(ctx, x, y, size, lift, colors, kind, seed) {
    const rnd = randomFrom(seed);
    const right = x + size;
    poly(ctx, colors[3], [[x, y], [x + lift, y - lift], [right + lift, y - lift], [right, y]]);
    poly(ctx, colors[0], [[right, y], [right + lift, y - lift], [right + lift, y + size - lift], [right, y + size]]);
    rect(ctx, colors[1], x, y, size, size);
    for (let i = 0; i < 46; i += 1) {
      const width = 1 + Math.floor(rnd() * Math.max(2, size / 5));
      const px = x + Math.floor(rnd() * (size - width));
      const py = y + Math.floor(rnd() * (size - 1));
      rect(ctx, colors[i % 4], px, py, width, i % 4 === 0 ? 2 : 1);
    }
    rect(ctx, colors[3], x + 1, y, size - 1, 1);
    rect(ctx, colors[0], x, y + size - 2, size, 2);
    rect(ctx, colors[0], x + size - 1, y, 1, size);
    rect(ctx, colors[4], x + lift + 2, y - lift, size - 3, 1);
    for (let i = 0; i < Math.floor(lift / 2); i += 1) {
      const px = right + 1 + Math.floor(rnd() * Math.max(1, lift - 2));
      const py = y + Math.floor(rnd() * Math.max(1, size - lift));
      rect(ctx, colors[1], px, py, 1, 2 + Math.floor(rnd() * 4));
    }
    if (kind === 'brand') {
      rect(ctx, green[2], x, y, size, 3);
      rect(ctx, green[1], x + 2, y + 3, size - 5, 2);
      rect(ctx, green[2], x + 3, y + 5, 2, 1);
      poly(ctx, green[3], [[x, y], [x + lift, y - lift], [right + lift, y - lift], [right, y]]);
      rect(ctx, green[4], x + lift + 2, y - lift, size - 4, 1);
      return;
    }
    if (kind === 'stone') return;
    const minerals = ores[kind];
    for (let i = 0; i < 6; i += 1) {
      const px = x + 2 + Math.floor(rnd() * (size - 7));
      const py = y + 2 + Math.floor(rnd() * (size - 7));
      const nugget = i % 3 + Math.max(2, Math.floor(size / 8));
      rect(ctx, minerals[0], px - 1, py + 2, nugget + 3, nugget);
      rect(ctx, minerals[2], px, py + 1, nugget, nugget);
      rect(ctx, minerals[3], px + 1, py, nugget - 1, Math.max(1, nugget - 2));
      rect(ctx, minerals[4], px + 1, py, 1, 1);
    }
  }

  function chipIcon(ctx, x, y, colors, scale = 1) {
    const box = (color, dx, dy, w, h) => rect(ctx, color, x + dx * scale, y + dy * scale, w * scale, h * scale);
    box(colors[0], -4, -2, 9, 5);
    box(colors[1], -3, -4, 7, 8);
    box(colors[2], -3, -3, 6, 5);
    box(colors[3], -2, -3, 4, 2);
    box(colors[4], -1, -3, 2, 1);
    box(colors[2], 3, -2, 2, 4);
  }

  function pick(ctx, x, y, tint, dark = false) {
    const handle = dark ? ['#2b3d23', '#395230', '#527041'] : [wood[0], wood[2], wood[4]];
    const head = dark ? ['#26351e', '#344b2d', '#46603a', '#607b4c', '#698251'] : tint;
    poly(ctx, handle[0], [[x + 4, y + 27], [x + 2, y + 24], [x + 20, y + 6], [x + 24, y + 6], [x + 24, y + 10], [x + 7, y + 27]]);
    poly(ctx, handle[1], [[x + 6, y + 23], [x + 20, y + 8], [x + 22, y + 9], [x + 6, y + 25]]);
    poly(ctx, handle[2], [[x + 7, y + 21], [x + 18, y + 10], [x + 19, y + 11], [x + 8, y + 22]]);
    poly(ctx, head[0], [[x + 5, y + 7], [x + 5, y + 3], [x + 14, y + 3], [x + 23, y + 6], [x + 28, y + 12], [x + 29, y + 23], [x + 25, y + 23], [x + 23, y + 16], [x + 17, y + 10], [x + 12, y + 8]]);
    poly(ctx, head[2], [[x + 6, y + 5], [x + 14, y + 5], [x + 23, y + 8], [x + 27, y + 14], [x + 27, y + 20], [x + 24, y + 15], [x + 20, y + 11], [x + 13, y + 7]]);
    rect(ctx, head[4], x + 7, y + 4, 7, 1);
    rect(ctx, head[3], x + 15, y + 5, 4, 1);
    rect(ctx, head[3], x + 24, y + 10, 2, 2);
  }

  function cart(ctx, x, y, fullness) {
    rect(ctx, '#171b17', x + 3, y + 14, 29, 2);
    for (const wheel of [6, 23]) {
      rect(ctx, metal[0], x + wheel, y + 10, 6, 6);
      rect(ctx, metal[3], x + wheel + 2, y + 12, 2, 2);
    }
    if (fullness > .2) chipIcon(ctx, x + 11, y - 1, gold);
    if (fullness > .44) chipIcon(ctx, x + 21, y - 4, jade);
    if (fullness > .72) chipIcon(ctx, x + 28, y - 1, violet);
    poly(ctx, metal[0], [[x - 1, y], [x + 34, y], [x + 28, y + 12], [x + 4, y + 12]]);
    poly(ctx, metal[2], [[x, y + 2], [x + 32, y + 2], [x + 27, y + 10], [x + 5, y + 10]]);
    rect(ctx, metal[4], x, y, 33, 2);
    rect(ctx, metal[1], x + 10, y + 3, 2, 6);
    rect(ctx, metal[1], x + 23, y + 3, 2, 6);
  }

  function drill(ctx, x, y, progress, level) {
    rect(ctx, '#171b17', x - 3, y + 21, 44, 3);
    rect(ctx, metal[1], x + 1, y + 15, 31, 6);
    rect(ctx, metal[3], x + 3, y + 16, 26, 2);
    rect(ctx, metal[0], x + 1, y - 1, 28, 17);
    rect(ctx, gold[1], x + 3, y, 24, 14);
    rect(ctx, gold[3], x + 4, y + 1, 22, 3);
    rect(ctx, level >= 4 ? jade[2] : gold[2], x + 8, y + 7, 12, 4);
    rect(ctx, green[4], x + 5, y + 6, 2, 2);
    const piston = Math.floor(Math.sin(progress * Math.PI * 2) * 3);
    poly(ctx, metal[3], [[x + 26, y + 5], [x + 38 + piston, y + 5], [x + 44 + piston, y + 9], [x + 38 + piston, y + 13], [x + 26, y + 13]]);
    for (const groove of [29, 33, 37]) {
      rect(ctx, metal[1], x + groove + piston, y + 7, 2, 5);
    }
  }

  function forge(ctx, x, y, warmth, level) {
    rect(ctx, rock[0], x, y + 6, 29, 23);
    rect(ctx, metal[1], x + 2, y + 5, 25, 5);
    rect(ctx, rock[2], x + 3, y + 11, 23, 16);
    rect(ctx, metal[2], x + 19, y - 6, 7, 12);
    rect(ctx, metal[4], x + 18, y - 7, 9, 2);
    rect(ctx, wood[0], x + 6, y + 15, 17, 10);
    rect(ctx, gold[1], x + 8, y + 17, 13, 7);
    rect(ctx, warmth > .6 ? gold[4] : gold[3], x + 10, y + 19 - Math.floor(warmth * 3), 8, 5);
    rect(ctx, level >= 4 ? jade[3] : gold[2], x + 12, y + 17, 3, 5);
    rect(ctx, metal[4], x + 3, y + 10, 16, 1);
  }

  function icon(canvas, name = canvas.dataset.icon, level = 0) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 32, 32);
    switch (name) {
      case 'brand': cube(ctx, 4, 9, 19, 5, wood, 'brand', 59); break;
      case 'ore': cube(ctx, 5, 10, 17, 5, rock, 'copper', 513); break;
      case 'pick':
      case 'pick-dark': pick(ctx, 0, 0, pickTints[Math.min(pickTints.length - 1, level)], name === 'pick-dark'); break;
      case 'core': chipIcon(ctx, 15, 15, violet, 2.4); break;
      case 'pulse': chipIcon(ctx, 15, 15, jade, 2); rect(ctx, jade[3], 4, 14, 4, 2); rect(ctx, jade[3], 24, 14, 4, 2); break;
      case 'cart': ctx.scale(.78, .78); cart(ctx, 3, 14, .83); ctx.resetTransform(); break;
      case 'drill': ctx.scale(.58, .78); drill(ctx, 4, 11, .1, level); ctx.resetTransform(); break;
      case 'forge': ctx.scale(.82, .82); forge(ctx, 4, 9, .7, level); ctx.resetTransform(); break;
      case 'workshop':
        rect(ctx, wood[1], 4, 11, 24, 16); rect(ctx, wood[3], 5, 10, 22, 5);
        rect(ctx, wood[2], 6, 16, 18, 8); rect(ctx, gold[3], 11, 12, 9, 2);
        rect(ctx, wood[0], 7, 16, 2, 11); rect(ctx, wood[0], 22, 16, 2, 11);
        rect(ctx, metal[3], 15, 5, 9, 2);
        break;
      case 'gear':
        for (const [x, y, w, h] of [[6, 9, 20, 13], [9, 6, 13, 20], [13, 4, 6, 24], [4, 13, 24, 6]]) rect(ctx, metal[2], x, y, w, h);
        rect(ctx, metal[4], 9, 9, 13, 2); rect(ctx, gold[3], 12, 12, 8, 8); rect(ctx, metal[0], 14, 14, 4, 4);
        break;
      case 'flag':
        rect(ctx, wood[2], 9, 6, 2, 21); rect(ctx, gold[3], 11, 6, 13, 9);
        rect(ctx, gold[4], 12, 6, 12, 2); rect(ctx, gold[1], 22, 12, 4, 3); rect(ctx, wood[0], 6, 26, 12, 2);
        break;
      case 'map':
        rect(ctx, wood[1], 5, 6, 22, 20); rect(ctx, gold[3], 7, 7, 17, 17);
        rect(ctx, green[3], 9, 10, 4, 4); rect(ctx, green[1], 12, 15, 7, 3);
        rect(ctx, wood[1], 18, 11, 3, 3); rect(ctx, wood[1], 11, 21, 7, 1);
        break;
      case 'sound':
      case 'mute':
        poly(ctx, metal[4], [[5, 12], [10, 12], [16, 7], [16, 24], [10, 19], [5, 19]]);
        if (name === 'sound') {
          rect(ctx, jade[3], 20, 11, 2, 10); rect(ctx, jade[2], 24, 9, 2, 14);
        } else {
          for (let i = 0; i < 6; i += 1) {
            rect(ctx, gold[3], 21 + i, 13 + i, 1, 1);
            rect(ctx, gold[3], 26 - i, 13 + i, 1, 1);
          }
        }
        break;
    }
  }

  function tile(canvas, type, seed, damage) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 48, 48);
    rect(ctx, '#1d2319', 7, 41, 35, 3);
    cube(ctx, 5, 10, 33, 7, rock, type, seed);
    if (damage <= 0) return;
    const paths = [
      [[22, 10], [20, 18], [26, 25], [21, 31], [23, 41]],
      [[20, 18], [13, 19], [9, 16], [5, 17]],
      [[26, 25], [35, 21], [42, 22]],
      [[21, 31], [13, 35], [8, 33], [5, 37]],
      [[35, 21], [32, 15], [36, 8]]
    ];
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#222820';
    const count = Math.min(paths.length, 1 + Math.floor(damage * paths.length));
    for (const path of paths.slice(0, count)) {
      ctx.beginPath();
      ctx.moveTo(...path[0]);
      for (const point of path.slice(1)) ctx.lineTo(...point);
      ctx.stroke();
    }
  }

  function tree(ctx, x, y, size, colors) {
    rect(ctx, wood[0], x, y - size, 7, size);
    rect(ctx, wood[2], x + 1, y - size, 3, size);
    rect(ctx, colors[0], x - 11, y - size - 13, 28, 18);
    rect(ctx, colors[1], x - 10, y - size - 15, 24, 16);
    rect(ctx, colors[2], x - 6, y - size - 22, 16, 14);
    rect(ctx, colors[3], x - 4, y - size - 21, 13, 3);
    rect(ctx, colors[4], x - 8, y - size - 9, 5, 2);
    rect(ctx, colors[3], x + 4, y - size - 11, 7, 3);
  }

  function ridge(ctx, y, amplitudes, color) {
    const points = [[0, 122]];
    amplitudes.forEach((height, i) => {
      if (i) points.push([i * 40, y - amplitudes[i - 1]]);
      points.push([i * 40, y - height]);
    });
    points.push([480, y - amplitudes.at(-1)], [480, 122]);
    poly(ctx, color, points);
  }

  function support(ctx, x, y, lower) {
    rect(ctx, wood[0], x - 8, y, 48, 7);
    rect(ctx, wood[3], x - 8, y, 47, 2);
    rect(ctx, wood[1], x, y + 4, 7, lower);
    rect(ctx, wood[2], x + 1, y + 4, 2, lower);
    rect(ctx, wood[1], x + 29, y + 4, 7, lower);
    rect(ctx, wood[2], x + 30, y + 4, 2, lower);
    poly(ctx, wood[2], [[x + 5, y + 18], [x + 15, y + 4], [x + 19, y + 4], [x + 5, y + 25]]);
    rect(ctx, gold[0], x + 10, y + 9, 2, 15);
    rect(ctx, gold[1], x + 8, y + 20, 6, 7);
    rect(ctx, gold[3], x + 9, y + 20, 4, 4);
    rect(ctx, gold[4], x + 10, y + 20, 2, 2);
  }

  function ray(ctx, x, y, radius, tint, opacity) {
    const gradient = ctx.createRadialGradient(x, y, 1, x, y, radius);
    gradient.addColorStop(0, tint);
    gradient.addColorStop(1, tint + '00');
    ctx.globalAlpha = opacity;
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalAlpha = 1;
  }

  function prepareScene(layer) {
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 270;
    const ctx = canvas.getContext('2d');
    const rnd = randomFrom(519 + 467 * layer);
    const [sky, haze, cloud, hill, grass, shadow, underground, rockFace] = palettes[layer];
    const leaf = [grass, hill, layer === 4 ? '#8e749c' : green[2], layer === 4 ? '#be8eb4' : green[3], green[4]];
    rect(ctx, sky, 0, 0, 480, 270);
    rect(ctx, haze, 0, 62, 480, 52);
    rect(ctx, cloud, 0, 84, 480, 23);
    rect(ctx, layer >= 3 ? '#e3dfbc' : '#f4d090', 354, 23, 23, 22);
    rect(ctx, '#fff2c4', 357, 25, 17, 2);
    for (const [x, y, width] of [[89, 32, 59], [176, 21, 41], [263, 43, 52], [405, 28, 47], [26, 61, 22]]) {
      rect(ctx, cloud, x, y, width, 7);
      rect(ctx, cloud, x + 7, y - 4, width - 20, 4);
      rect(ctx, haze, x + 2, y + 7, width - 9, 2);
    }
    ridge(ctx, 104, [16, 25, 32, 26, 15, 24, 37, 29, 22, 17, 34, 43], haze);
    ridge(ctx, 110, [11, 22, 15, 9, 13, 19, 25, 13, 9, 24, 34, 20], hill);
    for (const [x, y, size] of [[24, 96, 18], [54, 89, 24], [82, 98, 13], [320, 96, 17], [402, 103, 18], [436, 97, 24], [465, 95, 19]]) tree(ctx, x, y, size, leaf);
    const terrain = [[0, 96], [31, 96], [31, 102], [73, 102], [73, 92], [99, 92], [99, 99], [135, 99], [135, 108], [181, 108], [181, 114], [264, 114], [264, 107], [320, 107], [320, 101], [354, 101], [354, 96], [390, 96], [390, 104], [430, 104], [430, 93], [480, 93]];
    poly(ctx, underground, [...terrain, [480, 270], [0, 270]]);
    terrain.forEach(([x, y], index) => {
      const width = (terrain[index + 1]?.[0] ?? x) - x;
      if (!width) return;
      rect(ctx, grass, x, y, width, 7);
      rect(ctx, leaf[2], x, y, width, 2);
      rect(ctx, rockFace, x, y + 7, width, 8);
      rect(ctx, leaf[1], x + 2, y + 4, width - 3, 4);
      for (let offset = 0; offset < width; offset += 5) {
        const h = 1 + Math.floor(rnd() * 4);
        rect(ctx, offset % 4 ? leaf[3] : leaf[4], x + offset, y - h, 1, h);
        rect(ctx, rockFace, x + offset + 1, y + 12 + Math.floor(rnd() * 5), 3, 2);
      }
    });
    const arch = [[0, 235], [18, 177], [57, 177], [57, 152], [91, 152], [91, 138], [132, 138], [132, 128], [172, 128], [172, 115], [306, 115], [306, 123], [349, 123], [349, 137], [387, 137], [387, 149], [423, 149], [423, 173], [459, 173], [459, 202], [480, 202], [480, 270], [0, 270]];
    poly(ctx, rockFace, arch);
    poly(ctx, shadow, arch.map(([x, y], i) => [x, i < arch.length - 2 ? y + 7 : y]));
    for (let i = 0; i < 240; i += 1) {
      const x = Math.floor(rnd() * 480);
      const y = 122 + Math.floor(rnd() * 145);
      const inside = y > 148 + Math.abs(x - 240) * .22;
      rect(ctx, inside ? underground : rockFace, x, y, 2 + Math.floor(rnd() * 8), 1 + Math.floor(rnd() * 3));
    }
    const shelves = [[0, 228], [55, 228], [55, 220], [124, 220], [124, 216], [280, 216], [280, 221], [353, 221], [353, 211], [451, 211], [451, 217], [480, 217], [480, 270], [0, 270]];
    poly(ctx, underground, shelves);
    poly(ctx, rockFace, [[144, 211], [160, 211], [160, 206], [319, 206], [319, 210], [340, 210], [340, 225], [144, 225]]);
    rect(ctx, shadow, 151, 220, 182, 2);
    for (const x of [180, 240, 300]) {
      rect(ctx, shadow, x - 24, 157, 48, 54);
      rect(ctx, rockFace, x - 25, 156, 49, 2);
      rect(ctx, rockFace, x - 25, 158, 2, 53);
      rect(ctx, '#111915', x - 24, 212, 49, 3);
    }
    for (let i = 0; i < 100; i += 1) {
      const x = Math.floor(rnd() * 480);
      const y = 228 + Math.floor(rnd() * 42);
      rect(ctx, i % 5 ? rockFace : gold[0], x, y, 2 + Math.floor(rnd() * 7), 1 + (i % 3 === 0));
    }
    for (const [x, y] of [[24, 178], [115, 158], [359, 160], [423, 175]]) {
      ray(ctx, x + 11, y + 20, 32, '#e6b56c', .23);
      support(ctx, x, y, 48);
    }
    for (const x of [35, 101, 391, 455]) {
      const y = x < 160 ? 232 : 223;
      chipIcon(ctx, x, y, x % 2 ? ores.copper : jade, .7);
      rect(ctx, rockFace, x + 7, y + 3, 8, 2);
    }
    for (let x = 4; x < 161; x += 12) rect(ctx, wood[2], x, 226, 5, 7);
    rect(ctx, metal[2], 0, 226, 159, 2);
    rect(ctx, metal[3], 0, 230, 159, 1);
    rect(ctx, wood[0], 353, 212, 97, 3);
    return canvas;
  }

  function machinePoint(id, progress) {
    if (id === 'cart') return { x: 25 + Math.round((1 - Math.cos(progress * Math.PI * 2)) * 50), y: 209 };
    if (id === 'drill') return { x: 386, y: 188 };
    return { x: 96, y: 169 };
  }

  function scene(canvas, base, levels, progress, reduced) {
    const ctx = canvas.getContext('2d');
    ctx.drawImage(base, 0, 0);
    if (levels.cart) {
      const position = machinePoint('cart', reduced ? .22 : progress.cart);
      cart(ctx, position.x, position.y, progress.cart);
    }
    if (levels.drill) {
      const position = machinePoint('drill', progress.drill);
      drill(ctx, position.x, position.y, reduced ? 0 : progress.drill, levels.drill);
    }
    if (levels.forge) {
      const position = machinePoint('forge', progress.forge);
      ray(ctx, position.x + 13, position.y + 19, 25, '#ef942f', .28 + .12 * progress.forge);
      forge(ctx, position.x, position.y, reduced ? .6 : progress.forge, levels.forge);
      if (!reduced) {
        for (let i = 0; i < 4; i += 1) {
          const rise = (progress.forge + i * .25) % 1;
          ctx.globalAlpha = (1 - rise) * .42;
          rect(ctx, metal[4], position.x + 20 + rise * 9, position.y - 7 - rise * 17, 2 + i, 2 + i);
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  function effects(canvas) {
    const ctx = canvas.getContext('2d');
    let motes = [];
    let rings = [];
    let swipes = [];
    function chips(x, y, colors, count, strength, now) {
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (25 + Math.random() * 68) * strength;
        motes.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 28, size: 2 + i % 3, color: colors[i % colors.length], now, life: .36 + Math.random() * .48 });
      }
      if (motes.length > 310) motes = motes.slice(-310);
    }
    function ring(x, y, color, size, now) {
      rings.push({ x, y, color, size, now });
    }
    function swing(x, y, level, now) {
      swipes.push({ x, y, level, now });
    }
    function draw(now) {
      ctx.clearRect(0, 0, 480, 270);
      motes = motes.filter(mote => now - mote.now < mote.life * 1000);
      rings = rings.filter(ring => now - ring.now < 430);
      swipes = swipes.filter(swipe => now - swipe.now < 160);
      for (const expanding of rings) {
        const t = Math.max(0, (now - expanding.now) / 430);
        const width = Math.floor(8 + expanding.size * t);
        ctx.globalAlpha = (1 - t) * .8;
        ctx.lineWidth = t < .2 ? 3 : 2;
        ctx.strokeStyle = expanding.color;
        ctx.strokeRect(Math.floor(expanding.x - width), Math.floor(expanding.y - width * .58), width * 2, Math.floor(width * 1.16));
      }
      for (const mote of motes) {
        const dt = Math.max(0, now - mote.now) / 1000;
        ctx.globalAlpha = Math.min(1, (1 - dt / mote.life) * 2);
        rect(ctx, mote.color, mote.x + mote.vx * dt, mote.y + mote.vy * dt + 115 * dt ** 2, mote.size, mote.size);
      }
      ctx.globalAlpha = 1;
      for (const swipe of swipes) {
        const t = (now - swipe.now) / 160;
        ctx.save();
        ctx.translate(swipe.x + 22 - t * 14, swipe.y + 22 + t * 9);
        ctx.rotate(-.88 + t * .95);
        pick(ctx, -13, -21, pickTints[Math.min(swipe.level, pickTints.length - 1)]);
        ctx.restore();
      }
    }
    function clear() {
      motes = [];
      rings = [];
      swipes = [];
      ctx.clearRect(0, 0, 480, 270);
    }
    return { chips, ring, swing, draw, clear };
  }

  return { ores, slots, icon, tile, prepareScene, machinePoint, scene, effects };
})();
