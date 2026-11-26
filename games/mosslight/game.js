'use strict';

const SAVE_KEY = 'blockburrow-mine-v2';
const LEGACY_KEY = 'mosslight-outpost-v1';
const OFFLINE_LIMIT = 8 * 60 * 60;
const BEACON_TARGET = 23000;
const COMBO_LENGTH = 5500;
const MAX_CHAIN = 8;
const MAX_LEVEL = 200;
const HOLD_INTERVAL = 175;
const sectors = [
  { name: '草岩矿口', subtitle: '地表入口', depth: 12, threshold: 0, boost: 1, deck: ['stone', 'stone', 'stone', 'coal', 'coal', 'copper', 'copper', 'jade'] },
  { name: '铜叶地窟', subtitle: '矿层 02', depth: 48, threshold: 170, boost: 1.24, deck: ['stone', 'coal', 'coal', 'copper', 'copper', 'copper', 'jade', 'amber'] },
  { name: '赤岩峡井', subtitle: '矿层 03', depth: 116, threshold: 720, boost: 1.57, deck: ['coal', 'copper', 'copper', 'jade', 'jade', 'amber', 'amber', 'stone'] },
  { name: '翡翠裂谷', subtitle: '矿层 04', depth: 236, threshold: 2900, boost: 2.05, deck: ['coal', 'copper', 'jade', 'jade', 'jade', 'amber', 'amber', 'core'] },
  { name: '基岩穹窿', subtitle: '矿层 05', depth: 390, threshold: 10800, boost: 2.65, deck: ['copper', 'copper', 'jade', 'jade', 'amber', 'amber', 'core', 'core'] }
];
const minerals = {
  stone: { name: '页岩', health: 2, value: 6 },
  coal: { name: '煤纹矿', health: 3, value: 10 },
  copper: { name: '赤铜矿', health: 4, value: 17 },
  jade: { name: '翠晶矿', health: 5, value: 28, rare: true },
  amber: { name: '琥珀矿', health: 7, value: 46, rare: true },
  core: { name: '紫辉矿', health: 9, value: 72, rare: true }
};
const facilities = [
  { id: 'pick', name: '精钢矿镐', description: '每级 +1 镐击力', cost: 18, growth: 1.62, threshold: 0 },
  { id: 'cart', name: '轨道矿车', description: '装矿并送回库存', cost: 42, growth: 1.50, threshold: 28, cycle: 2.8, output: 12 },
  { id: 'drill', name: '活塞钻机', description: '连续钻进坚硬矿层', cost: 190, growth: 1.54, threshold: 150, cycle: 2.1, output: 30 },
  { id: 'forge', name: '鼓风熔炉', description: '额外冶炼，每级手挖 +9%', cost: 680, growth: 1.62, threshold: 510, cycle: 3.6, output: 105 }
];
const machines = facilities.filter(facility => facility.cycle);
const ui = Object.fromEntries([
  'balance', 'rate', 'power', 'cores', 'sectorIndex', 'sectorTitle', 'depth', 'cave', 'effects', 'vein', 'veinLabel',
  'combo', 'chainBar', 'floatLayer', 'mine', 'pulse', 'chargeBar', 'chargeValue', 'facilities', 'exploration',
  'facilitiesTab', 'explorationTab', 'missionText', 'missionCount', 'missionBar', 'total', 'lastEvent',
  'saveStatus', 'help', 'sound', 'dialog', 'dialogTitle', 'dialogBody', 'dialogDismiss', 'dialogConfirm'
].map(id => [id, document.getElementById(id)]));

const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
const exact = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const visual = Art.effects(ui.effects);
const start = Date.now();
const loaded = readSave(start);
let state = loaded.state;
let lastTick = state.savedAt;
let lastSave = start;
let dirty = false;
let storageFailed;
let selectedTab = 'facilities';
let activeSlot = 1;
let chain = 0;
let chainUntil = 0;
let lastHit = -Infinity;
let holdUntil = Infinity;
let holding = null;
let lastFrame = -Infinity;
let lastInterface = -Infinity;
let baseScene;
let blocks = [];
let audio;
let impactNoise;

function bounded(value, fallback = 0, ceiling = 1e30) {
  return Number.isFinite(value) && value >= 0 ? Math.min(value, ceiling) : fallback;
}

function whole(value, fallback = 0, ceiling = 1e30) {
  return Math.floor(bounded(value, fallback, ceiling));
}

function unlockedSector(total) {
  return sectors.findLastIndex(sector => sector.threshold <= total);
}

function blank(now, cores = 0, sound = false) {
  return {
    balance: 0, total: 0, sector: 0, deepest: 0, cores, sound,
    breaks: 0, pulses: 0, charge: 0, seed: 5, savedAt: now,
    levels: Object.fromEntries(facilities.map(facility => [facility.id, 0])),
    phases: Object.fromEntries(machines.map(machine => [machine.id, 0]))
  };
}

function readSave(now) {
  const clean = blank(now);
  let migrated = false;
  try {
    const current = JSON.parse(localStorage.getItem(SAVE_KEY));
    const legacy = current ? null : JSON.parse(localStorage.getItem(LEGACY_KEY));
    const data = current || legacy;
    if (!data || typeof data !== 'object') return { state: clean, migrated };
    migrated = !!legacy;
    clean.total = whole(data.total);
    clean.balance = Math.min(clean.total, whole(data.balance));
    const maxSector = unlockedSector(clean.total);
    clean.sector = whole(data.sector, 0, maxSector);
    clean.deepest = Math.max(clean.sector, whole(data.deepest, 0, maxSector));
    clean.cores = whole(migrated ? data.stars : data.cores, 0, 1e9);
    clean.sound = data.sound === true;
    clean.savedAt = bounded(data.savedAt, now, now);
    clean.breaks = whole(data.breaks, migrated ? Math.floor(clean.total / 6) : 0);
    clean.pulses = whole(data.pulses);
    clean.charge = whole(data.charge, 0, 100);
    clean.seed = whole(data.seed, clean.seed, 0xffffffff);
    if (Array.isArray(data.vein) && data.vein.length === Art.slots.length) clean.vein = data.vein;
    for (const facility of facilities) {
      const oldId = migrated && facility.id === 'cart' ? 'beetle' : facility.id;
      clean.levels[facility.id] = whole(data.levels?.[oldId], 0, MAX_LEVEL);
    }
    for (const machine of machines) {
      clean.phases[machine.id] = bounded(data.phases?.[machine.id], 0, .999999);
    }
  } catch {
    // A damaged or unavailable browser save leaves the game playable.
  }
  return { state: clean, migrated };
}

function save(now = Date.now()) {
  state.savedAt = now;
  lastSave = now;
  state.vein = blocks.map(({ type, seed, remaining }) => ({ type, seed, remaining }));
  let failed = false;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    dirty = false;
  } catch {
    failed = true;
  }
  if (failed === storageFailed) return;
  storageFailed = failed;
  ui.saveStatus.toggleAttribute('data-error', failed);
  setText(ui.saveStatus.lastElementChild, failed ? '存档不可用' : '自动存档');
}

function format(value) {
  if (value >= 1e12) return value.toExponential(1);
  if (value >= 1e8) return number.format(value / 1e8) + '亿';
  if (value >= 1e4) return number.format(value / 1e4) + '万';
  return number.format(value);
}

function setText(element, value) {
  const string = String(value);
  if (element.textContent !== string) element.textContent = string;
}

function announce(message) {
  setText(ui.lastEvent, message);
}

function multiplier() {
  return sectors[state.sector].boost * (1 + state.cores * .45);
}

function power() {
  return 1 + state.levels.pick;
}

function price(facility) {
  return Math.ceil(facility.cost * facility.growth ** state.levels[facility.id]);
}

function machineYield(machine) {
  return Math.round(machine.output * state.levels[machine.id] * multiplier());
}

function credit(amount) {
  if (amount <= 0) return;
  const prior = unlockedSector(state.total);
  state.total += amount;
  state.balance += amount;
  dirty = true;
  const current = unlockedSector(state.total);
  if (current > prior) announce('已发现' + sectors[current].name + '，前往「矿层地图」进入。');
}

function tickMachines(now, offline = false) {
  const seconds = Math.min(OFFLINE_LIMIT, Math.max(0, now - lastTick) / 1000);
  lastTick = now;
  if (!seconds) return 0;
  let income = 0;
  for (const machine of machines) {
    if (!state.levels[machine.id]) continue;
    const cycles = state.phases[machine.id] + seconds / machine.cycle;
    const completed = Math.floor(cycles);
    state.phases[machine.id] = cycles - completed;
    dirty = true;
    if (!completed) continue;
    const amount = completed * machineYield(machine);
    income += amount;
    if (!offline) showMachinePayout(machine.id, amount);
  }
  credit(income);
  if (offline && seconds >= 15 && income >= 1) {
    const time = seconds >= 60 ? Math.floor(seconds / 60) + ' 分钟' : Math.floor(seconds) + ' 秒';
    announce('离开 ' + time + '期间，设备运回 ' + format(income) + ' 矿料。');
  }
  return income;
}

function newBlock(index, initialType) {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  const deck = sectors[state.sector].deck;
  const type = initialType ?? deck[(state.seed >>> 17) % deck.length];
  const hardness = minerals[type].health + Math.floor(state.sector / 2);
  return {
    index, seed: state.seed, type, hardness, remaining: hardness, nextAt: 0
  };
}

function renderBlock(index) {
  const block = blocks[index];
  const button = blockButtons[index];
  const name = minerals[block.type].name;
  button.toggleAttribute('data-active', index === activeSlot);
  button.toggleAttribute('data-broken', block.nextAt > 0);
  button.setAttribute('aria-label', name + '，' + (block.nextAt ? '补充中' : '耐久 ' + block.remaining + ' / ' + block.hardness));
  if (!block.nextAt) Art.tile(button.firstElementChild, block.type, block.seed, 1 - block.remaining / block.hardness);
}

function renderVeinLabel() {
  const block = blocks[activeSlot];
  const mineral = minerals[block.type];
  const label = mineral.name + (block.nextAt ? ' · 露出下一块矿石' : ' · 耐久 ' + block.remaining + ' / ' + block.hardness);
  setText(ui.veinLabel, label);
}

function changeSlot(index) {
  if (index === activeSlot) return;
  const prior = activeSlot;
  activeSlot = index;
  renderBlock(prior);
  renderBlock(index);
  renderVeinLabel();
}

function resetMine(restoreVein = false) {
  baseScene = Art.prepareScene(state.sector);
  activeSlot = 1;
  chain = 0;
  chainUntil = 0;
  lastHit = -Infinity;
  visual.clear();
  ui.floatLayer.replaceChildren();
  const firstTypes = state.sector === 0 && !state.breaks ? ['stone', 'coal', 'copper'] : [];
  blocks = Art.slots.map((_, index) => {
    const previous = restoreVein && state.vein?.[index];
    if (!previous || !Object.hasOwn(minerals, previous.type) || !whole(previous.remaining)) {
      return newBlock(index, firstTypes[index]);
    }
    const hardness = minerals[previous.type].health + Math.floor(state.sector / 2);
    return { index, type: previous.type, seed: whole(previous.seed, 1, 0xffffffff), hardness, remaining: Math.min(hardness, whole(previous.remaining)), nextAt: 0 };
  });
  blocks.forEach(block => renderBlock(block.index));
  const sector = sectors[state.sector];
  setText(ui.sectorIndex, sector.subtitle);
  setText(ui.sectorTitle, sector.name);
  setText(ui.depth, '−' + sector.depth + ' m');
  renderVeinLabel();
  renderScene();
}

function replenish(now) {
  for (const block of blocks) {
    if (!block.nextAt || block.nextAt > now) continue;
    blocks[block.index] = newBlock(block.index);
    renderBlock(block.index);
    if (block.index === activeSlot) renderVeinLabel();
  }
}

function floatAt(label, x, y, kind = '') {
  const node = document.createElement('span');
  node.className = 'float-label' + (kind ? ' ' + kind : '');
  node.style.left = 100 * x / 480 + '%';
  node.style.top = 100 * y / 270 + '%';
  node.textContent = label;
  node.addEventListener('animationend', () => node.remove(), { once: true });
  if (ui.floatLayer.childElementCount >= 20) ui.floatLayer.firstElementChild.remove();
  ui.floatLayer.append(node);
}

function restartAnimation(element, name) {
  if (motion.matches) return;
  element.classList.remove(name);
  void element.offsetWidth;
  element.classList.add(name);
}

function showMachinePayout(id, amount) {
  const now = performance.now();
  const point = Art.machinePoint(id, id === 'cart' ? 0 : 1);
  const x = point.x + (id === 'drill' ? 41 : 16);
  const y = point.y - 7;
  if (!motion.matches) {
    const tint = id === 'forge' ? Art.ores.amber : id === 'drill' ? Art.ores.copper : Art.ores.jade;
    visual.chips(x, y + 5, tint, 12, .72, now);
    visual.ring(x, y + 13, tint[3], 27, now);
  }
  floatAt('+' + format(amount), x, y, 'machine');
}

function breakBlock(block, now, blast = false) {
  const data = minerals[block.type];
  const x = Art.slots[block.index];
  chain = Math.min(MAX_CHAIN, now < chainUntil ? chain + 1 : 1);
  chainUntil = now + COMBO_LENGTH;
  const surge = chain === 4 || chain === MAX_CHAIN;
  const streak = 1 + (chain - 1) * .14 + (surge ? .31 : 0);
  const amount = Math.ceil(data.value * streak * multiplier() * (1 + state.levels.forge * .09));
  block.nextAt = now + 155;
  block.remaining = 0;
  state.breaks += 1;
  credit(amount);
  if (!blast) {
    state.charge = Math.min(100, state.charge + (data.rare ? 31 : 23));
    if (state.charge === 100) announce('爆脉冲击已充能，可一次炸开整排矿块。');
  }
  renderBlock(block.index);
  if (!motion.matches) {
    const tint = Art.ores[block.type];
    visual.chips(x, 185, tint, blast ? 30 : surge || data.rare ? 42 : 22, blast ? 1.7 : 1.26, now);
    visual.chips(x, 187, Art.ores.stone, 10, 1, now);
    if (surge || data.rare) visual.ring(x, 183, tint[4], 48, now);
  }
  if (!blast) {
    floatAt((surge ? '暴击 ' : '') + '+' + format(amount), x, 160, surge || data.rare ? 'rare' : '');
    play(surge || data.rare ? 'rare' : 'break');
  }
  return amount;
}

function strike(now = performance.now()) {
  if (ui.dialog.open || now < lastHit + 105) return;
  replenish(now);
  const block = blocks[activeSlot];
  if (block.nextAt) return;
  lastHit = now;
  const x = Art.slots[activeSlot];
  const level = state.levels.pick;
  if (!motion.matches) visual.swing(x, 181, level, now);
  restartAnimation(blockButtons[activeSlot], 'hit');
  block.remaining = Math.max(0, block.remaining - power());
  dirty = true;
  if (block.remaining === 0) {
    breakBlock(block, now);
    restartAnimation(ui.balance, 'gain');
  } else {
    if (!motion.matches) visual.chips(x, 184, Art.ores[block.type], 8, .68, now);
    renderBlock(activeSlot);
    play('hit');
  }
  renderVeinLabel();
  render();
}

function pulse(now = performance.now()) {
  if (state.charge < 100 || ui.dialog.open) return;
  replenish(now);
  const targets = blocks.filter(block => !block.nextAt);
  if (!targets.length) return;
  state.charge = 0;
  state.pulses += 1;
  const amount = targets.reduce((sum, block) => sum + breakBlock(block, now, true), 0);
  if (!motion.matches) {
    visual.ring(240, 185, '#adf1c5', 202, now);
    visual.ring(240, 185, '#f5d783', 142, now);
    visual.chips(240, 178, Art.ores.jade, 38, 2, now);
  }
  floatAt('爆脉 +' + format(amount), 240, 141, 'blast');
  restartAnimation(ui.balance, 'gain');
  announce('冲击波破开 ' + targets.length + ' 块矿石，收获 ' + format(amount) + ' 矿料。');
  play('pulse');
  renderVeinLabel();
  render();
}

function beginHold(source, index = activeSlot) {
  if (holding !== null) return;
  changeSlot(index);
  const now = performance.now();
  holding = source;
  holdUntil = now + HOLD_INTERVAL;
  ui.mine.classList.add('pressed');
  strike(now);
}

function endHold(source = holding) {
  if (holding !== source) return;
  holding = null;
  holdUntil = Infinity;
  ui.mine.classList.remove('pressed');
}

function bindMiningButton(button, index) {
  button.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || holding !== null) return;
    button.setPointerCapture(event.pointerId);
    beginHold(event.pointerId, index);
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(event, pointer => endHold(pointer.pointerId));
  }
  button.addEventListener('click', event => {
    if (event.detail !== 0) return;
    if (index !== undefined) changeSlot(index);
    strike();
  });
}

const blockButtons = Art.slots.map((x, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ore-tile';
  button.style.setProperty('--slot', 100 * x / 480 + '%');
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 48;
  canvas.setAttribute('aria-hidden', 'true');
  button.append(canvas);
  bindMiningButton(button, index);
  ui.vein.append(button);
  return button;
});

function makeRow(icon, title, className = '') {
  const row = document.createElement('article');
  row.className = 'upgrade';
  row.innerHTML = '<span class="upgrade-icon"><canvas width="32" height="32" aria-hidden="true"></canvas><span class="upgrade-meter" aria-hidden="true"><span></span></span></span><div><h3></h3><p></p></div><button type="button" class="buy ' + className + '"></button>';
  setText(row.querySelector('h3'), title);
  const preview = row.querySelector('canvas');
  Art.icon(preview, icon);
  return { row, preview, description: row.querySelector('p'), button: row.querySelector('button'), meter: row.querySelector('.upgrade-meter > span') };
}

const workshop = facilities.map(facility => {
  const entry = makeRow(facility.id, facility.name);
  entry.button.addEventListener('click', () => buy(facility));
  ui.facilities.append(entry.row);
  return entry;
});

const map = sectors.map((sector, index) => {
  const entry = makeRow('map', sector.name, 'sector-action');
  entry.button.addEventListener('click', () => enter(index));
  ui.exploration.append(entry.row);
  return entry;
});

const beacon = makeRow('core', '基岩信标', 'sector-action beacon-button');
beacon.button.addEventListener('click', () => {
  if (!canRebuild()) return;
  showDialog('点亮基岩信标', [
    '本次获得 ' + exact.format(coreReward()) + ' 枚基岩晶核。每枚晶核使开采和设备产量永久增加 45%。',
    '点亮信标后，矿料、设备和矿层进度会重置，从草岩矿口开始新一轮。'
  ], true);
});
ui.exploration.append(beacon.row);

function buy(facility) {
  const now = Date.now();
  tickMachines(now);
  const cost = price(facility);
  const level = state.levels[facility.id];
  if (state.total < facility.threshold || state.balance < cost || level >= MAX_LEVEL) return;
  state.balance -= cost;
  state.levels[facility.id] += 1;
  if (facility.id === 'pick') {
    Art.icon(workshop[0].preview, 'pick', state.levels.pick);
    Art.icon(ui.power.closest('.resource').querySelector('canvas'), 'pick', state.levels.pick);
  } else {
    const point = Art.machinePoint(facility.id, state.phases[facility.id]);
    if (!motion.matches) {
      const time = performance.now();
      visual.ring(point.x + 12, point.y + 10, '#c6ec9a', 53, time);
      visual.chips(point.x + 12, point.y + 10, Art.ores.jade, 26, 1, time);
    }
    floatAt('Lv.' + state.levels[facility.id] + ' 启动', point.x + 16, point.y - 7, 'machine');
  }
  announce(facility.name + '升至 Lv.' + state.levels[facility.id] + (level || !facility.cycle ? '。' : '，开始运转。'));
  play('buy');
  save(now);
  renderScene();
  render();
  ui.mine.focus({ preventScroll: true, focusVisible: false });
}

function enter(index) {
  const now = Date.now();
  tickMachines(now);
  if (state.total < sectors[index].threshold || state.sector === index) return;
  endHold();
  state.sector = index;
  state.deepest = Math.max(state.deepest, index);
  resetMine();
  announce('已进入' + sectors[index].name + '。');
  play('buy');
  save(now);
  render();
}

function coreReward() {
  return Math.floor(Math.sqrt(state.total / (BEACON_TARGET / 2)));
}

function canRebuild() {
  return state.deepest === sectors.length - 1 && state.total >= BEACON_TARGET;
}

function rebuild() {
  if (ui.dialog.returnValue !== 'confirm' || !canRebuild()) return;
  const now = Date.now();
  tickMachines(now);
  const reward = coreReward();
  state = blank(now, Math.min(1e9, state.cores + reward), state.sound);
  lastTick = now;
  Art.icon(workshop[0].preview, 'pick');
  Art.icon(ui.power.closest('.resource').querySelector('canvas'), 'pick');
  resetMine();
  selectTab('facilities');
  save(now);
  announce('信标已点亮，获得 ' + exact.format(reward) + ' 枚晶核。');
  play('pulse');
  ui.mine.focus();
}

function showDialog(title, paragraphs, confirm = false) {
  endHold();
  ui.dialog.returnValue = '';
  setText(ui.dialogTitle, title);
  ui.dialogBody.replaceChildren(...paragraphs.map(text => {
    const p = document.createElement('p');
    p.textContent = text;
    return p;
  }));
  setText(ui.dialogDismiss, confirm ? '继续挖矿' : '知道了');
  ui.dialogConfirm.hidden = !confirm;
  ui.dialog.showModal();
}

function renderWorkshop() {
  facilities.forEach((facility, index) => {
    const { row, description, button, meter } = workshop[index];
    const level = state.levels[facility.id];
    const running = !!facility.cycle && level > 0;
    const locked = state.total < facility.threshold && level === 0;
    const capped = level >= MAX_LEVEL;
    const cost = price(facility);
    row.toggleAttribute('data-locked', locked);
    row.toggleAttribute('data-running', running);
    button.disabled = locked || capped || state.balance < cost;
    setText(button, locked ? '未解锁' : capped ? '满级' : format(cost));
    button.setAttribute('aria-label', locked ? facility.name + '尚未解锁' : capped ? facility.name + '已满级' : '升级' + facility.name + '，花费 ' + exact.format(cost) + ' 矿料');
    const effect = running ? '+' + format(machineYield(facility)) + ' / ' + facility.cycle + ' 秒' + (facility.id === 'forge' ? ' · 手挖 +' + level * 9 + '%' : '') : facility.description;
    const activation = locked ? ' · 累计 ' + exact.format(facility.threshold) + ' 解锁' : ' · Lv.' + level;
    setText(description, effect + activation);
    if (running) meter.style.width = state.phases[facility.id] * 100 + '%';
  });
}

function renderMap() {
  sectors.forEach((sector, index) => {
    const { row, description, button } = map[index];
    const locked = state.total < sector.threshold;
    row.toggleAttribute('data-locked', locked);
    button.disabled = locked || state.sector === index;
    setText(button, locked ? '未解锁' : state.sector === index ? '所在矿层' : '进入');
    button.setAttribute('aria-label', sector.name + '，' + button.textContent);
    setText(description, '−' + sector.depth + ' m · ' + (locked ? '累计 ' + exact.format(sector.threshold) + ' 解锁' : '产量 ×' + sector.boost));
  });
  beacon.button.disabled = !canRebuild();
  setText(beacon.button, '点亮');
  setText(beacon.description, canRebuild() ? '可获得 ' + exact.format(coreReward()) + ' 枚永久晶核' : '到达基岩穹窿并累计 ' + exact.format(BEACON_TARGET));
}

function selectTab(name) {
  selectedTab = name;
  for (const tab of ['facilities', 'exploration']) {
    const selected = name === tab;
    ui[tab + 'Tab'].setAttribute('aria-selected', selected);
    ui[tab + 'Tab'].tabIndex = selected ? 0 : -1;
    ui[tab].hidden = !selected;
  }
  render();
}

function mission() {
  if (state.breaks < 3) return ['敲开三块矿石', state.breaks, 3];
  if (!state.levels.pick) return ['打造精钢矿镐，一击打掉更多耐久', state.balance, facilities[0].cost];
  if (!state.levels.cart) return ['造一辆轨道矿车，开始自动运矿', state.balance, facilities[1].cost];
  if (!state.pulses) return [state.charge < 100 ? '接着破块，为爆脉冲击充能' : '释放一次爆脉冲击', state.charge, 100];
  for (let index = 1; index < sectors.length; index += 1) {
    if (state.deepest >= index) continue;
    const sector = sectors[index];
    return [state.total < sector.threshold ? '继续采矿，发现' + sector.name : '在「矿层地图」中进入' + sector.name, state.total, sector.threshold];
  }
  return [canRebuild() ? '点亮基岩信标，获得永久增产的晶核' : '累计开采 ' + exact.format(BEACON_TARGET) + ' 矿料，为基岩信标充能', state.total, BEACON_TARGET];
}

function renderMission() {
  const [goal, progress, target] = mission();
  const filled = Math.min(progress, target);
  setText(ui.missionText, goal);
  setText(ui.missionCount, exact.format(filled) + ' / ' + exact.format(target));
  ui.missionBar.setAttribute('aria-valuemax', target);
  ui.missionBar.setAttribute('aria-valuenow', Math.floor(filled));
  ui.missionBar.firstElementChild.style.width = 100 * filled / target + '%';
}

function renderCombo(now = performance.now()) {
  const remaining = Math.max(0, (chainUntil - now) / COMBO_LENGTH);
  const count = remaining ? chain : 0;
  setText(ui.combo, '连击 ×' + count);
  ui.combo.toggleAttribute('data-hot', count >= 4);
  ui.chainBar.style.width = 100 * remaining + '%';
}

function render() {
  setText(ui.balance, format(state.balance));
  setText(ui.total, format(state.total));
  setText(ui.rate, format(machines.reduce((sum, machine) => sum + machineYield(machine) / machine.cycle, 0)));
  setText(ui.power, power());
  setText(ui.cores, format(state.cores));
  setText(ui.chargeValue, state.charge + '%');
  ui.chargeBar.style.width = state.charge + '%';
  ui.pulse.toggleAttribute('data-ready', state.charge === 100);
  ui.pulse.setAttribute('aria-disabled', state.charge !== 100);
  ui.pulse.setAttribute('aria-label', '爆脉冲击，能量 ' + state.charge + '%');
  renderCombo();
  renderMission();
  if (selectedTab === 'facilities') renderWorkshop();
  else renderMap();
}

function renderScene() {
  Art.scene(ui.cave, baseScene, state.levels, state.phases, motion.matches);
}

function animation(now) {
  if (now - lastFrame >= 32) {
    lastFrame = now;
    const current = Date.now();
    tickMachines(current);
    replenish(now);
    if (holding !== null && now >= holdUntil) {
      holdUntil = now + HOLD_INTERVAL;
      strike(now);
    }
    renderScene();
    if (!motion.matches) visual.draw(now);
    renderCombo(now);
    if (dirty && current - lastSave >= 5000) save(current);
    if (now - lastInterface >= 120) {
      render();
      lastInterface = now;
    }
  }
  requestAnimationFrame(animation);
}

const notes = {
  hit: { tones: [164], duration: .048, volume: .036, noise: .035 },
  break: { tones: [207, 311], duration: .065, volume: .048, noise: .09 },
  rare: { tones: [330, 495, 659], duration: .091, volume: .055, noise: .09 },
  pulse: { tones: [110, 220, 330, 523, 784], duration: .135, volume: .08, noise: .16 },
  buy: { tones: [311, 415, 622], duration: .084, volume: .05, noise: 0 }
};

function play(kind) {
  if (!state.sound || !window.AudioContext) return;
  try {
    audio ||= new AudioContext();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    const attack = notes[kind];
    const startAt = audio.currentTime;
    attack.tones.forEach((pitch, index) => {
      const at = startAt + index * attack.duration * .6;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.frequency.value = pitch;
      oscillator.type = kind === 'hit' ? 'square' : 'triangle';
      gain.gain.setValueAtTime(.0001, at);
      gain.gain.exponentialRampToValueAtTime(attack.volume, at + .006);
      gain.gain.exponentialRampToValueAtTime(.0001, at + attack.duration);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + attack.duration);
    });
    if (attack.noise) {
      if (!impactNoise) {
        impactNoise = audio.createBuffer(1, Math.floor(audio.sampleRate * .27), audio.sampleRate);
        const samples = impactNoise.getChannelData(0);
        for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1;
      }
      const debris = audio.createBufferSource();
      const gain = audio.createGain();
      const lowpass = audio.createBiquadFilter();
      debris.buffer = impactNoise;
      lowpass.type = 'lowpass';
      lowpass.frequency.value = kind === 'hit' ? 980 : 460;
      gain.gain.setValueAtTime(attack.noise, startAt);
      gain.gain.exponentialRampToValueAtTime(.0001, startAt + attack.duration * 1.2);
      debris.connect(lowpass).connect(gain).connect(audio.destination);
      debris.start(startAt);
      debris.stop(startAt + attack.duration * 1.2);
    }
  } catch {
    // Mining works in browsers that block sound.
  }
}

function renderSound() {
  const label = state.sound ? '关闭音效' : '开启音效';
  ui.sound.setAttribute('aria-pressed', state.sound);
  ui.sound.setAttribute('aria-label', label);
  ui.sound.title = label;
  Art.icon(ui.sound.firstElementChild, state.sound ? 'sound' : 'mute');
}

document.querySelectorAll('canvas[data-icon]').forEach(canvas => Art.icon(canvas));
bindMiningButton(ui.mine);
ui.pulse.addEventListener('click', () => pulse());
ui.sound.addEventListener('click', () => {
  state.sound = !state.sound;
  renderSound();
  play('buy');
  const now = Date.now();
  tickMachines(now);
  save(now);
});
ui.help.addEventListener('click', () => showDialog('矿镇手册', [
  '点击矿块可选中并敲击。按住矿块、挥镐按钮或空格可以连续开采，数字键 1–3 切换目标。',
  '连续破块可叠加连击和充能。能量满时按 F 或点「爆脉冲击」，能炸开当前整排矿块。',
  '矿车、钻机和熔炉会在画面中按各自周期运转。矿镇可离线工作 8 小时，进度在当前浏览器自动保存。'
]));
ui.dialog.addEventListener('close', rebuild);
for (const name of ['facilities', 'exploration']) {
  const tab = ui[name + 'Tab'];
  tab.addEventListener('click', () => selectTab(name));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'facilities' : event.key === 'End' ? 'exploration' : name === 'facilities' ? 'exploration' : 'facilities';
    selectTab(next);
    ui[next + 'Tab'].focus();
  });
}

document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || ui.dialog.open || event.target.closest?.('input,textarea,[contenteditable]')) return;
  if (event.code === 'KeyF' && !event.repeat) {
    event.preventDefault();
    pulse();
  } else if (/^Digit[1-3]$/.test(event.code) && !event.repeat) {
    const index = Number(event.code.slice(-1)) - 1;
    changeSlot(index);
    if (blockButtons.includes(document.activeElement)) blockButtons[index].focus({ preventScroll: true });
  } else if (event.code === 'Space') {
    const focused = event.target.closest?.('button,a,[role=tab]');
    if (focused && focused !== ui.mine && !blockButtons.includes(focused)) return;
    event.preventDefault();
    if (!event.repeat) beginHold('keyboard', blockButtons.includes(focused) ? blockButtons.indexOf(focused) : activeSlot);
  }
});
document.addEventListener('keyup', event => {
  if (event.code === 'Space') endHold('keyboard');
});
window.addEventListener('blur', () => endHold());
document.addEventListener('visibilitychange', () => {
  endHold();
  const now = Date.now();
  tickMachines(now, true);
  save(now);
  if (!document.hidden) render();
});
window.addEventListener('pagehide', () => {
  const now = Date.now();
  tickMachines(now, true);
  save(now);
});
motion.addEventListener('change', () => visual.clear());

const offlineIncome = tickMachines(start, true);
if (loaded.migrated && !offlineIncome) announce('已继承苔光矿站的矿料、设施和晶核。');
resetMine(true);
Art.icon(workshop[0].preview, 'pick', state.levels.pick);
Art.icon(ui.power.closest('.resource').querySelector('canvas'), 'pick', state.levels.pick);
renderSound();
render();
save(start);
requestAnimationFrame(animation);
