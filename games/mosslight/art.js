'use strict';

const Art = (() => {
  const mint = ['#244b45', '#418f75', '#6ecca1', '#b0f2be', '#e2ffce'];
  const purple = ['#382852', '#685083', '#9c77bc', '#d1a6eb', '#f0d6ff'];
  const amber = ['#483149', '#94644d', '#c99259', '#efbd78', '#ffe4a0'];
  const steel = ['#27233d', '#4c415d', '#756686', '#ae9cb9', '#d9cee0'];
  const ink = ['#14281e', '#1b3827', '#28513a', '#3a6c4a', '#4b815b'];
  const sprites = {
    crystal: [mint, ['......54........', '.....544........', '....54432.......', '....54332..4....', '...544332.443...', '...543322.432...', '..544332.4432...', '..544332.4321...', '..54332244321...', '..5433243321....', '...433433221....', '...34333221.....', '....333221......', '.....2211.......', '......11........']],
    bolt: [amber, ['........44......', '.......444......', '......444.......', '.....443........', '....443.........', '...44344444.....', '...44333342.....', '....2224432.....', '......4432......', '.....4432.......', '....4432........', '....432.........', '...432..........', '...32...........', '...2............']],
    pick: [purple, ['................', '...555555.......', '.....444455.....', '.......33445....', '.......23434....', '......223..34...', '.....223...34...', '....223.....3...', '...223..........', '..223...........', '.223............', '.23.............', '................']],
    star: [amber, ['................', '.......4........', '.......5........', '......454.......', '......454.......', '.....4554.......', '..34455554333...', '...455555442....', '....4555442.....', '.....45442......', '.....44242......', '....442.242.....', '....42...22.....', '...42.....22....']],
    depth: [steel, ['.......5........', '......454.......', '.....45.54......', '....45...54.....', '...45.....54....', '................', '...34.....43....', '....34...43.....', '.....34.43......', '......343.......', '.......3........', '................', '...3..3..3..3...']],
    gear: [purple, ['......444.......', '...44.444.44....', '..34444444443...', '..34443334443...', '...443...344....', '.4443.....3444..', '.4443.....3444..', '.4443.....3444..', '...443...344....', '..34443334443...', '..34444444443...', '...44.444.44....', '......444.......']],
    flag: [purple, ['................', '...454444.......', '...454444444....', '...454444444....', '...454443333....', '...45333........', '...45...........', '...45...........', '...45...........', '...45...........', '...45...........', '..4454444.......', '.333333333......']],
    mute: [steel, ['................', '......55........', '.....455........', '..555455.....4..', '..555455..4.4...', '..555455...4....', '..555455..4.4...', '..444455.4...4..', '.....455........', '......55........']],
    sound: [mint, ['................', '......55....4...', '.....455.....4..', '..555455...4..4.', '..555455....4.4.', '..555455....4.4.', '..555455...4..4.', '..444455.....4..', '.....455....4...', '......55........']],
    help: [steel, ['................', '.....55555......', '....55...55.....', '....55...55.....', '.........55.....', '........55......', '......555.......', '......55........', '................', '......55........', '......55........']],
    lock: [steel, ['................', '.....4444.......', '....44..44......', '....44..44......', '...44444444.....', '...44555444.....', '...445.5444.....', '...443.3444.....', '...44333444.....', '...44444444.....', '................']],
    beetle: [mint, ['................', '.....4...4......', '......4.4.......', '.....23332......', '....3454442.....', '..2.3454432.2...', '...234534322....', '..22345343222...', '...234534322....', '..2.3454432.2...', '....234332......', '.....2222.......']],
    drill: [amber, ['................', '................', '...333333.......', '..45553332......', '.244333332444...', '.2433333233334..', '.24333332333334.', '.244333332444...', '..43333332......', '...222222.......', '..3332333.......', '.333333333......']],
    forge: [amber, ['................', '.......44.......', '...33..54.......', '...33..554......', '...333.554......', '..344444443.....', '..344333443.....', '..343545343.....', '..343555343.....', '..343454343.....', '..344333443.....', '..233333332.....', '.22222222222....']],
    beacon: [amber, ['.......5........', '...4..454..4....', '.....45554......', '...45455454....', '.....45554......', '...4..454..4....', '.......5........', '.....33333......', '......434.......', '......434.......', '.....44344......', '....4433344.....', '...333333333....']]
  };
  sprites['pick-dark'] = [ink, sprites.pick[1].map(row => row.replace(/5/g, '1').replace(/4/g, '2'))];

  const palettes = [
    { back: '#131427', far: '#1d233a', mid: '#30304b', near: '#38304c', edge: '#211b35', rock: '#4e4163', light: '#645071', glimmer: mint, haze: '#527a80' },
    { back: '#171329', far: '#282043', mid: '#3b3158', near: '#453557', edge: '#281e36', rock: '#614776', light: '#825e92', glimmer: purple, haze: '#7a6493' },
    { back: '#191423', far: '#302137', mid: '#493049', near: '#542f42', edge: '#311f2f', rock: '#744452', light: '#8e5863', glimmer: amber, haze: '#9f6d6a' },
    { back: '#14202b', far: '#1d3540', mid: '#2c474f', near: '#2e454f', edge: '#1c303c', rock: '#42616b', light: '#597980', glimmer: mint, haze: '#6e9d93' },
    { back: '#1c152b', far: '#332444', mid: '#4a3550', near: '#533c54', edge: '#30233c', rock: '#76536c', light: '#947080', glimmer: amber, haze: '#9f7981' }
  ];

  function sprite(canvas, name = canvas.dataset.sprite) {
    const [colors, pixels] = sprites[name];
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 16, 16);
    pixels.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) {
        const color = colors[Number(row[x]) - 1];
        if (color) rect(ctx, color, x, y + 1, 1, 1);
      }
    });
  }

  function rect(ctx, color, x, y, width, height) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);
  }

  function polygon(ctx, color, points) {
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

  function shard(ctx, x, y, height, width, lean, colors) {
    const tip = [x + lean, y - height];
    const left = [x + lean - width, y - height + width];
    const right = [x + lean + width, y - height + width * 2];
    const middle = [x + lean + 1, y - height + width + 2];
    polygon(ctx, colors[0], [[x - width, y + 1], [left[0] - 1, left[1]], [tip[0], tip[1] - 1], [right[0] + 1, right[1]], [x + width, y + 2]]);
    polygon(ctx, colors[2], [[x - width + 1, y], left, middle, [x, y]]);
    polygon(ctx, colors[1], [[x, y], middle, right, [x + width - 1, y]]);
    polygon(ctx, colors[3], [left, tip, middle]);
    polygon(ctx, colors[2], [middle, tip, right]);
    polygon(ctx, colors[4], [left, tip, [middle[0] - 2, middle[1] - 2]]);
    rect(ctx, colors[3], left[0] + 1, left[1] + 3, 1, Math.max(2, Math.floor(height / 5)));
  }

  function cluster(ctx, x, y, size, colors) {
    const unit = value => Math.round(value * size);
    shard(ctx, x - unit(10), y, unit(30), unit(5), -unit(10), colors);
    shard(ctx, x + unit(10), y - 1, unit(43), unit(7), unit(11), colors);
    shard(ctx, x, y, unit(61), unit(9), -unit(4), colors);
    shard(ctx, x - unit(12), y + 1, unit(20), unit(4), -unit(7), colors);
    shard(ctx, x + unit(12), y + 2, unit(24), unit(5), unit(7), colors);
    shard(ctx, x + unit(1), y + 2, unit(27), unit(5), -unit(3), colors);
  }

  function glow(ctx, x, y, radius, color, opacity) {
    const haze = ctx.createRadialGradient(x, y, 1, x, y, radius);
    haze.addColorStop(0, color);
    haze.addColorStop(1, `${color}00`);
    ctx.globalAlpha = opacity;
    ctx.fillStyle = haze;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalAlpha = 1;
  }

  function rail(ctx) {
    for (let x = 8; x < 414; x += 18) {
      polygon(ctx, '#281d32', [[x - 5, 185], [x + 7, 185], [x + 13, 205], [x, 205]]);
      polygon(ctx, '#74556b', [[x - 5, 185], [x + 5, 185], [x + 10, 201], [x, 201]]);
      rect(ctx, '#a27576', x - 2, 188, 5, 1);
    }
    rect(ctx, '#211b2c', 0, 187, 400, 6);
    rect(ctx, '#211b2c', 0, 198, 400, 6);
    rect(ctx, '#71667e', 0, 188, 400, 2);
    rect(ctx, '#847388', 0, 199, 400, 2);
    rect(ctx, '#44354f', 0, 191, 400, 1);
  }

  function lantern(ctx, x, y) {
    glow(ctx, x + 2, y + 1, 20, '#e8a262', .44);
    rect(ctx, '#292034', x - 2, y - 4, 9, 10);
    rect(ctx, '#b37b59', x - 1, y - 3, 7, 8);
    rect(ctx, '#edb378', x, y - 1, 5, 5);
    rect(ctx, '#ffe0a2', x + 1, y, 3, 3);
    rect(ctx, '#654658', x - 2, y + 5, 9, 1);
  }

  function cart(ctx, x, y, colors) {
    rect(ctx, '#302237', x + 2, y + 11, 29, 6);
    rect(ctx, '#1b1929', x + 4, y + 14, 6, 6);
    rect(ctx, '#1b1929', x + 23, y + 14, 6, 6);
    rect(ctx, '#807287', x + 6, y + 16, 2, 2);
    rect(ctx, '#807287', x + 25, y + 16, 2, 2);
    shard(ctx, x + 12, y + 3, 13, 4, -3, colors);
    shard(ctx, x + 20, y + 3, 17, 4, 2, colors);
    shard(ctx, x + 25, y + 4, 9, 3, 1, colors);
    polygon(ctx, '#40324b', [[x - 2, y], [x + 34, y], [x + 29, y + 14], [x + 4, y + 14]]);
    polygon(ctx, '#64506a', [[x, y + 3], [x + 32, y + 3], [x + 29, y + 10], [x + 3, y + 10]]);
    rect(ctx, '#a48a93', x - 2, y, 36, 2);
    rect(ctx, '#9d7680', x + 4, y + 5, 4, 2);
    rect(ctx, '#9d7680', x + 24, y + 5, 4, 2);
  }

  function support(ctx, x, y, height) {
    rect(ctx, '#241c33', x - 7, y, 47, 7);
    rect(ctx, '#674554', x - 5, y + 1, 44, 3);
    rect(ctx, '#302134', x, y + 5, 5, height);
    rect(ctx, '#6c4756', x + 1, y + 5, 2, height);
    rect(ctx, '#302134', x + 29, y + 5, 5, height);
    rect(ctx, '#6c4756', x + 30, y + 5, 2, height);
    polygon(ctx, '#815766', [[x + 4, y + 17], [x + 14, y + 5], [x + 18, y + 5], [x + 4, y + 24]]);
  }

  function prepareScene(canvas, sector, levels) {
    const width = canvas.width;
    const height = canvas.height;
    const base = document.createElement('canvas');
    base.width = width;
    base.height = height;
    const ctx = base.getContext('2d');
    const palette = palettes[sector];
    const rnd = randomFrom(1803 + sector * 173);
    const { back, far, mid, near, edge, rock, light, glimmer, haze } = palette;
    rect(ctx, back, 0, 0, width, height);
    glow(ctx, 213, 108, 170, haze, .67);
    polygon(ctx, far, [[0, 86], [32, 69], [51, 72], [70, 46], [94, 48], [111, 63], [137, 70], [155, 105], [170, 112], [188, 139], [206, 132], [227, 148], [263, 121], [273, 87], [286, 81], [316, 54], [329, 60], [344, 43], [369, 54], [400, 43], [400, 199], [0, 199]]);
    polygon(ctx, mid, [[0, 125], [31, 98], [47, 100], [62, 86], [71, 90], [87, 111], [111, 116], [134, 140], [150, 147], [168, 164], [230, 172], [255, 144], [275, 131], [297, 110], [313, 111], [326, 92], [349, 96], [371, 80], [400, 90], [400, 192], [0, 192]]);
    polygon(ctx, near, [[0, 129], [26, 121], [31, 128], [58, 126], [75, 139], [104, 142], [123, 156], [166, 161], [187, 178], [232, 164], [259, 150], [290, 146], [309, 129], [332, 132], [359, 117], [380, 119], [400, 104], [400, 197], [0, 197]]);
    for (let i = 0; i < 85; i += 1) {
      const x = Math.floor(rnd() * width);
      const y = 63 + Math.floor(rnd() * 110);
      if (y < 146 - Math.abs(x - 200) * .38) continue;
      rect(ctx, i % 3 === 0 ? light : rock, x, y, 2 + Math.floor(rnd() * 7), 1);
      if (i % 5 === 0) rect(ctx, rock, x + 4, y + 2, 8, 1);
    }
    glow(ctx, 200, 124, 67, glimmer[2], .34);
    glow(ctx, 78, 134, 38, glimmer[2], .22);
    glow(ctx, 340, 127, 29, glimmer[2], .25);
    cluster(ctx, 70, 148, .42, glimmer);
    cluster(ctx, 328, 144, .33, glimmer);
    cluster(ctx, 359, 132, .21, glimmer);

    polygon(ctx, rock, [[0, 177], [37, 171], [57, 166], [105, 168], [132, 161], [163, 166], [177, 156], [231, 156], [242, 160], [266, 157], [289, 166], [330, 160], [358, 164], [379, 157], [400, 159], [400, 230], [0, 230]]);
    polygon(ctx, edge, [[0, 186], [48, 183], [76, 176], [125, 178], [156, 173], [200, 178], [246, 174], [272, 175], [295, 169], [328, 175], [352, 172], [400, 172], [400, 230], [0, 230]]);
    for (let i = 0; i < 130; i += 1) {
      const x = Math.floor(rnd() * 400);
      const y = Math.floor(181 + rnd() * 49);
      rect(ctx, i % 4 === 0 ? light : near, x, y, 1 + Math.floor(rnd() * 6), 1);
    }
    rail(ctx);
    polygon(ctx, edge, [[0, 0], [400, 0], [400, 102], [384, 91], [378, 71], [365, 71], [359, 57], [345, 53], [341, 41], [317, 34], [309, 24], [277, 23], [251, 16], [216, 22], [188, 15], [164, 19], [152, 26], [123, 24], [111, 35], [82, 37], [68, 49], [56, 53], [51, 66], [32, 70], [21, 102], [0, 119]]);
    polygon(ctx, near, [[0, 26], [30, 31], [43, 44], [55, 39], [65, 41], [56, 52], [43, 57], [37, 73], [24, 78], [16, 100], [0, 110]]);
    polygon(ctx, near, [[400, 24], [374, 24], [364, 39], [345, 40], [352, 54], [365, 59], [372, 72], [387, 78], [400, 91]]);
    for (let i = 0; i < 88; i += 1) {
      const x = Math.floor(rnd() * 400);
      const y = Math.floor(rnd() * (19 + Math.abs(x - 200) * .32));
      rect(ctx, i % 6 === 0 ? light : rock, x, y, 2 + Math.floor(rnd() * 10), 1);
      if (i % 4 === 0) rect(ctx, near, x + 3, y + 2, 5, 2);
    }
    for (const [x, y, size] of [[39, 53, 17], [56, 40, 14], [96, 30, 19], [129, 23, 14], [162, 20, 10], [260, 20, 13], [307, 25, 21], [347, 45, 17], [371, 62, 20]]) {
      polygon(ctx, near, [[x - 5, y - 4], [x + 5, y - 4], [x + 4, y + 4], [x + 1, y + size], [x - 1, y + size - 4], [x - 4, y + 4]]);
      rect(ctx, rock, x - 3, y - 2, 1, Math.floor(size / 2));
    }

    support(ctx, 31, 124, 50);
    support(ctx, 331, 112, 50);
    rect(ctx, '#33253a', 30, 127, 1, 13);
    rect(ctx, '#33253a', 351, 115, 1, 16);
    lantern(ctx, 27, 143);
    lantern(ctx, 348, 133);
    cart(ctx, 291, 173, glimmer);

    polygon(ctx, '#2a2439', [[165, 171], [170, 161], [179, 161], [189, 150], [211, 149], [224, 155], [232, 154], [246, 170], [225, 176], [187, 176]]);
    polygon(ctx, rock, [[167, 169], [180, 162], [189, 152], [212, 151], [226, 158], [234, 158], [244, 168], [223, 172], [188, 173]]);
    polygon(ctx, light, [[171, 169], [191, 156], [212, 154], [227, 162], [235, 166], [221, 165], [205, 168], [187, 167]]);
    glow(ctx, 204, 136, 52, glimmer[3], .39);
    cluster(ctx, 205, 163, 1.09, glimmer);
    cluster(ctx, 231, 166, .34, glimmer);
    cluster(ctx, 181, 169, .30, glimmer);
    for (const [x, y, size] of [[11, 217, .39], [31, 220, .23], [111, 213, .21], [268, 224, .25], [382, 216, .46]]) cluster(ctx, x, y, size, glimmer);
    for (let i = 0; i < 66; i += 1) {
      const x = 5 + Math.floor(rnd() * 390);
      const y = 155 + Math.floor(rnd() * 68);
      if (y > 186 && y < 207) continue;
      rect(ctx, glimmer[i % 5 === 0 ? 2 : 0], x, y, i % 2 ? 2 : 4, 1);
    }

    if (levels.beetle) {
      const icon = document.createElement('canvas');
      icon.width = icon.height = 16;
      sprite(icon, 'beetle');
      ctx.drawImage(icon, 132, 156);
      if (levels.beetle >= 5) ctx.drawImage(icon, 248, 160);
    }
    if (levels.drill || levels.forge) {
      const icon = document.createElement('canvas');
      icon.width = icon.height = 16;
      ctx.imageSmoothingEnabled = false;
      if (levels.drill) {
        sprite(icon, 'drill');
        ctx.drawImage(icon, 94, 147, 26, 26);
      }
      if (levels.forge) {
        sprite(icon, 'forge');
        glow(ctx, 275, 158, 22, '#eeb875', .35);
        ctx.drawImage(icon, 264, 140, 27, 27);
      }
    }
    const motes = Array.from({ length: 33 }, () => ({ x: 33 + rnd() * 334, y: 35 + rnd() * 130, phase: rnd() * 7, color: rnd() > .24 ? glimmer[3] : '#f3c78f' }));
    return { base, glimmer, motes };
  }

  function drawFrame(canvas, scene, time, bursts) {
    const ctx = canvas.getContext('2d');
    ctx.drawImage(scene.base, 0, 0);
    for (const mote of scene.motes) {
      const wave = time / 1000 + mote.phase;
      ctx.globalAlpha = .23 + .30 * (Math.sin(wave) + 1);
      const x = Math.round(mote.x + Math.sin(wave) * 3);
      const y = Math.round(mote.y + Math.cos(wave * .7) * 2);
      rect(ctx, mote.color, x, y, 1, 1);
      if (mote.phase < 1.2) rect(ctx, mote.color, x - 1, y, 3, 1);
    }
    for (const burst of bursts) {
      const age = (time - burst.time) / 560;
      ctx.globalAlpha = Math.max(0, 1 - age);
      for (const chip of burst.chips) {
        rect(ctx, chip.color, Math.round(204 + chip.dx * age), Math.round(135 + chip.dy * age + age ** 2 * 24), chip.size, chip.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function miningBurst(scene, time) {
    return { time, chips: Array.from({ length: 11 }, (_, i) => ({
      dx: -53 + Math.random() * 106,
      dy: -93 + Math.random() * 67,
      size: 1 + (i % 3),
      color: scene.glimmer[2 + i % 3]
    })) };
  }

  return { sprite, prepareScene, drawFrame, miningBurst };
})();
