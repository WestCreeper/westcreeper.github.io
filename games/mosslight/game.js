'use strict';

const SAVE_KEY = 'mosslight-outpost-v1';
const OFFLINE_LIMIT = 8 * 60 * 60;
const BEACON_TARGET = 24000;
const MAX_LEVEL = 200;
const sectors = [
  { name: '微光洞穴', depth: 24, threshold: 0, boost: 1, flavor: '苔晶矿脉正在发光' },
  { name: '紫晶回廊', depth: 78, threshold: 75, boost: 1.15, flavor: '岩壁映着淡紫色的光' },
  { name: '琥珀断层', depth: 162, threshold: 450, boost: 1.4, flavor: '裂隙里传来暖风' },
  { name: '荧菌深井', depth: 306, threshold: 2400, boost: 1.85, flavor: '荧菌沿着岩缝蔓延' },
  { name: '地心遗迹', depth: 512, threshold: 12000, boost: 2.5, flavor: '沉睡的信标就在前方' }
];
const upgrades = [
  { id: 'pick', title: '精炼矿镐', detail: '手动 +1.5 / 次', cost: 12, growth: 1.55, threshold: 0, click: 1.5, idle: 0 },
  { id: 'beetle', title: '矿工甲虫', detail: '自动 +0.7 / 秒', cost: 25, growth: 1.42, threshold: 25, click: 0, idle: .7 },
  { id: 'drill', title: '共振钻机', detail: '自动 +4 / 秒', cost: 145, growth: 1.54, threshold: 170, click: 0, idle: 4 },
  { id: 'forge', title: '地热熔炉', detail: '自动 +18 / 秒，手动 +3 / 次', cost: 850, growth: 1.62, threshold: 1100, click: 3, idle: 18 }
];

const byId = id => document.getElementById(id);
const ui = Object.fromEntries([
  'balance', 'rate', 'power', 'stars', 'sectorIndex', 'sectorTitle', 'depth', 'sectorFlavor',
  'cave', 'mine', 'mineYield', 'floatLayer', 'facilities', 'exploration', 'facilitiesTab',
  'explorationTab', 'missionText', 'missionCount', 'missionBar', 'total',
  'lastEvent', 'saveStatus', 'help', 'sound', 'dialog', 'dialogTitle', 'dialogBody',
  'dialogDismiss', 'dialogConfirm'
].map(id => [id, byId(id)]));

function emptySave(stars = 0, sound = false, now = Date.now()) {
  return {
    balance: 0, total: 0, sector: 0, deepest: 0, stars, sound, savedAt: now,
    levels: Object.fromEntries(upgrades.map(upgrade => [upgrade.id, 0]))
  };
}

function validNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function readSave(now) {
  const fresh = emptySave(0, false, now);
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!data || typeof data !== 'object') return fresh;
    fresh.total = validNumber(data.total);
    fresh.balance = Math.min(fresh.total, validNumber(data.balance));
    fresh.stars = Math.min(1e9, Math.floor(validNumber(data.stars)));
    fresh.sound = data.sound === true;
    fresh.savedAt = Math.min(now, validNumber(data.savedAt, now));
    const highest = unlockedSector(fresh.total);
    fresh.sector = Math.min(highest, Math.floor(validNumber(data.sector)));
    fresh.deepest = Math.min(highest, Math.max(fresh.sector, Math.floor(validNumber(data.deepest))));
    for (const upgrade of upgrades) {
      fresh.levels[upgrade.id] = Math.min(MAX_LEVEL, Math.floor(validNumber(data.levels?.[upgrade.id])));
    }
  } catch {
    // A browser can block storage, and a save can be unreadable. A fresh run still works.
  }
  return fresh;
}

const started = Date.now();
let state = readSave(started);
let lastTick = state.savedAt;
let lastSave = started;
let dirty = false;
let storageFailed = null;
let selectedTab = 'facilities';
let scene;
let bursts = [];
let lastFrame = 0;
let pressTimer;
let audio;
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const standardNumber = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const integerNumber = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });

function format(value) {
  if (value >= 1e13) return value.toExponential(2);
  if (value >= 1e8) return `${standardNumber.format(value / 1e8)}亿`;
  if (value >= 1e4) return `${standardNumber.format(value / 1e4)}万`;
  return standardNumber.format(value);
}

function exact(value) {
  return integerNumber.format(Math.floor(value));
}

function unlockedSector(total) {
  return sectors.findLastIndex(sector => sector.threshold <= total);
}

function production() {
  let manual = 1;
  let passive = 0;
  for (const upgrade of upgrades) {
    manual += upgrade.click * state.levels[upgrade.id];
    passive += upgrade.idle * state.levels[upgrade.id];
  }
  const multiplier = sectors[state.sector].boost * (1 + state.stars * .45);
  return { click: manual * multiplier, idle: passive * multiplier };
}

function cost(upgrade) {
  return Math.ceil(upgrade.cost * (upgrade.growth ** state.levels[upgrade.id]));
}

function setText(element, value) {
  const text = String(value);
  if (element.textContent !== text) element.textContent = text;
}

function announce(message) {
  setText(ui.lastEvent, message);
}

function credit(amount) {
  if (amount <= 0) return;
  const previous = unlockedSector(state.total);
  state.balance += amount;
  state.total += amount;
  dirty = true;
  const current = unlockedSector(state.total);
  if (current > previous) announce(`已发现${sectors[current].name}，在「勘探」中进入。`);
}

function settle(now, offline = false) {
  const elapsed = Math.min(OFFLINE_LIMIT, Math.max(0, now - lastTick) / 1000);
  lastTick = now;
  const earned = elapsed * production().idle;
  credit(earned);
  if (offline && elapsed >= 15 && earned >= 1) {
    const minutes = Math.floor(elapsed / 60);
    const time = minutes ? `${minutes} 分钟` : `${Math.floor(elapsed)} 秒`;
    announce(`离开 ${time}期间，设施开采了 ${format(earned)} 苔晶。`);
  }
}

function save(now = Date.now()) {
  state.savedAt = now;
  lastSave = now;
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
  setText(ui.saveStatus.lastElementChild, failed ? '存档不可用' : '本地存档');
}

function canvasMarkup(name) {
  return `<canvas width="16" height="16" data-sprite="${name}" aria-hidden="true"></canvas>`;
}

function makeRow(sprite, name, details, action, classes = 'buy') {
  const row = document.createElement('article');
  row.className = 'upgrade';
  row.innerHTML = `<span class="upgrade-icon">${canvasMarkup(sprite)}</span><div><h3>${name}</h3><p>${details}</p></div><button type="button" class="${classes}">${action}</button>`;
  return { row, description: row.querySelector('p'), button: row.querySelector('button') };
}

const upgradeRows = upgrades.map(upgrade => {
  const entry = makeRow(upgrade.id, upgrade.title, '', `${canvasMarkup('crystal')}<span></span>`);
  entry.amount = entry.button.lastElementChild;
  entry.icon = entry.button.firstElementChild;
  entry.button.addEventListener('click', () => buy(upgrade));
  ui.facilities.append(entry.row);
  return entry;
});

const sectorRows = sectors.map((sector, index) => {
  const entry = makeRow('depth', sector.name, `−${sector.depth} m`, '', 'buy sector-action');
  entry.button.addEventListener('click', () => enterSector(index));
  ui.exploration.append(entry.row);
  return entry;
});

const beacon = makeRow('beacon', '地心信标', '', '点亮', 'beacon-button');
beacon.button.addEventListener('click', () => {
  if (!canLightBeacon()) return;
  showDialog('点亮地心信标', [
    `这次会获得 ${exact(beaconReward())} 枚星屑。每枚永久增加 45% 的手动和自动产量。`,
    '点亮后会从微光洞穴开始新一轮。库存、设施和矿层进度将重置，星屑会保留。'
  ], true);
});
ui.exploration.append(beacon.row);
document.querySelectorAll('canvas[data-sprite]').forEach(canvas => Art.sprite(canvas));

function beaconReward() {
  return Math.floor(Math.sqrt(state.total / 12000));
}

function canLightBeacon() {
  return state.deepest === sectors.length - 1 && state.total >= BEACON_TARGET;
}

function renderFacilities() {
  upgrades.forEach((upgrade, index) => {
    const { row, description, button, amount, icon } = upgradeRows[index];
    const level = state.levels[upgrade.id];
    const locked = state.total < upgrade.threshold;
    const capped = level >= MAX_LEVEL;
    const price = cost(upgrade);
    row.toggleAttribute('data-locked', locked);
    button.toggleAttribute('data-locked', locked);
    button.disabled = locked || capped || state.balance < price;
    setText(description, locked ? `累计 ${exact(upgrade.threshold)} 解锁` : `${upgrade.detail} · Lv.${level}`);
    setText(amount, capped ? '满级' : locked ? '' : format(price));
    icon.hidden = capped;
    const iconName = locked ? 'lock' : 'crystal';
    if (icon.dataset.sprite !== iconName) {
      icon.dataset.sprite = iconName;
      Art.sprite(icon);
    }
    button.setAttribute('aria-label', locked ? `${upgrade.title}尚未解锁` : capped ? `${upgrade.title}已满级` : `升级${upgrade.title}，花费 ${exact(price)} 苔晶`);
  });
}

function renderExploration() {
  sectors.forEach((sector, index) => {
    const { row, description, button } = sectorRows[index];
    const locked = state.total < sector.threshold;
    row.toggleAttribute('data-locked', locked);
    button.disabled = locked || state.sector === index;
    setText(description, locked ? `−${sector.depth} m · 累计 ${exact(sector.threshold)} 解锁` : `−${sector.depth} m · 产量 ×${sector.boost}`);
    setText(button, locked ? '未解锁' : state.sector === index ? '所在矿层' : '进入');
    button.setAttribute('aria-label', `${sector.name}，${button.textContent}`);
  });
  beacon.button.disabled = !canLightBeacon();
  setText(beacon.description, canLightBeacon() ? `可获得 ${exact(beaconReward())} 枚永久星屑` : `到达地心遗迹并累计 ${exact(BEACON_TARGET)}`);
}

function currentMission() {
  const steps = [
    [12, '累计开采 12 苔晶，为第一把精炼矿镐攒钱'],
    [25, '累计开采 25 苔晶，解锁矿工甲虫'],
    [75, '累计开采 75 苔晶，发现紫晶回廊', 1],
    [170, '累计开采 170 苔晶，解锁共振钻机'],
    [450, '累计开采 450 苔晶，发现琥珀断层', 2],
    [1100, '累计开采 1,100 苔晶，解锁地热熔炉'],
    [2400, '累计开采 2,400 苔晶，发现荧菌深井', 3],
    [12000, '累计开采 12,000 苔晶，发现地心遗迹', 4],
    [BEACON_TARGET, '累计开采 24,000 苔晶，为地心信标充能']
  ];
  for (const [target, text, sector] of steps) {
    if (state.total < target) return { target, text };
    if (sector !== undefined && state.deepest < sector) {
      return { target, text: `在「勘探」中进入${sectors[sector].name}` };
    }
  }
  return { target: BEACON_TARGET, text: `在「勘探」中点亮信标，领取 ${exact(beaconReward())} 枚星屑` };
}

function renderMission() {
  const { target, text } = currentMission();
  const progress = Math.min(state.total, target);
  setText(ui.missionText, text);
  setText(ui.missionCount, `${exact(progress)} / ${exact(target)}`);
  ui.missionBar.setAttribute('aria-valuemax', target);
  ui.missionBar.setAttribute('aria-valuenow', Math.floor(progress));
  ui.missionBar.firstElementChild.style.width = `${100 * progress / target}%`;
}

function render() {
  const { click, idle } = production();
  setText(ui.balance, format(Math.floor(state.balance)));
  setText(ui.stars, format(state.stars));
  setText(ui.mineYield, `+${format(click)}`);
  setText(ui.total, format(Math.floor(state.total)));
  ui.rate.firstChild.nodeValue = `${format(idle)} `;
  ui.power.firstChild.nodeValue = `${format(click)} `;
  renderMission();
  if (selectedTab === 'facilities') renderFacilities();
  else renderExploration();
}

function updateScene() {
  const sector = sectors[state.sector];
  setText(ui.sectorTitle, sector.name);
  setText(ui.sectorIndex, `矿层 ${String(state.sector + 1).padStart(2, '0')}`);
  setText(ui.depth, `−${sector.depth} m`);
  setText(ui.sectorFlavor, sector.flavor);
  scene = Art.prepareScene(ui.cave, state.sector, state.levels);
  bursts = [];
  Art.drawFrame(ui.cave, scene, 0, bursts);
}

function draw(time) {
  if (!motion.matches && time - lastFrame >= 50) {
    bursts = bursts.filter(burst => time - burst.time < 560);
    Art.drawFrame(ui.cave, scene, time, bursts);
    lastFrame = time;
  }
  requestAnimationFrame(draw);
}

function mine() {
  settle(Date.now());
  const amount = production().click;
  credit(amount);
  if (!motion.matches) bursts.push(Art.miningBurst(scene, performance.now()));
  const label = document.createElement('span');
  label.className = 'float-label';
  label.textContent = `+${format(amount)}`;
  label.style.left = `${46 + Math.random() * 11}%`;
  label.style.top = `${48 + Math.random() * 12}%`;
  label.addEventListener('animationend', () => label.remove(), { once: true });
  if (ui.floatLayer.childElementCount >= 20) ui.floatLayer.firstElementChild.remove();
  ui.floatLayer.append(label);
  ui.mine.classList.add('pressed');
  clearTimeout(pressTimer);
  pressTimer = setTimeout(() => ui.mine.classList.remove('pressed'), 100);
  playTone([233, 349], .05);
  render();
}

function buy(upgrade) {
  const now = Date.now();
  settle(now);
  const price = cost(upgrade);
  if (state.total < upgrade.threshold || state.balance < price || state.levels[upgrade.id] >= MAX_LEVEL) return;
  state.balance -= price;
  state.levels[upgrade.id] += 1;
  announce(`${upgrade.title}已升到 Lv.${state.levels[upgrade.id]}。`);
  if (upgrade.id !== 'pick') updateScene();
  playTone([440, 588], .085);
  save(now);
  render();
}

function enterSector(index) {
  const now = Date.now();
  settle(now);
  if (state.total < sectors[index].threshold || state.sector === index) return;
  state.sector = index;
  state.deepest = Math.max(state.deepest, index);
  announce(`已进入${sectors[index].name}。`);
  updateScene();
  playTone([294, 440, 587], .115);
  save(now);
  render();
}

function selectTab(name) {
  selectedTab = name;
  for (const tab of ['facilities', 'exploration']) {
    const selected = name === tab;
    ui[`${tab}Tab`].setAttribute('aria-selected', selected);
    ui[`${tab}Tab`].tabIndex = selected ? 0 : -1;
    ui[tab].hidden = !selected;
  }
  render();
}

function showDialog(title, paragraphs, confirm = false) {
  ui.dialog.returnValue = '';
  setText(ui.dialogTitle, title);
  ui.dialogBody.replaceChildren(...paragraphs.map(text => {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    return paragraph;
  }));
  setText(ui.dialogDismiss, confirm ? '继续开采' : '知道了');
  ui.dialogConfirm.hidden = !confirm;
  ui.dialog.showModal();
}

function lightBeacon() {
  if (ui.dialog.returnValue !== 'confirm' || !canLightBeacon()) return;
  const now = Date.now();
  settle(now);
  const reward = beaconReward();
  state = emptySave(Math.min(1e9, state.stars + reward), state.sound, now);
  updateScene();
  selectTab('facilities');
  save(now);
  announce(`信标点亮！获得 ${exact(reward)} 枚星屑，新一轮开采已开始。`);
  playTone([392, 523, 659, 784], .16);
  ui.mine.focus();
}

function renderSound() {
  const label = state.sound ? '关闭音效' : '开启音效';
  ui.sound.setAttribute('aria-pressed', state.sound);
  ui.sound.setAttribute('aria-label', label);
  ui.sound.title = label;
  Art.sprite(ui.sound.firstElementChild, state.sound ? 'sound' : 'mute');
}

function playTone(notes, duration) {
  if (!state.sound || !window.AudioContext) return;
  try {
    audio ||= new AudioContext();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    const start = audio.currentTime;
    notes.forEach((pitch, index) => {
      const oscillator = audio.createOscillator();
      const volume = audio.createGain();
      const time = start + index * duration * .84;
      oscillator.type = 'triangle';
      oscillator.frequency.value = pitch;
      volume.gain.setValueAtTime(.0001, time);
      volume.gain.exponentialRampToValueAtTime(.055, time + .009);
      volume.gain.exponentialRampToValueAtTime(.0001, time + duration);
      oscillator.connect(volume).connect(audio.destination);
      oscillator.start(time);
      oscillator.stop(time + duration);
    });
  } catch {
    // Audio availability does not affect mining.
  }
}

ui.mine.addEventListener('click', mine);
ui.help.addEventListener('click', () => showDialog('矿站手册', [
  '点击「开采苔晶」或按空格来开采。把苔晶花在设施上，提高每次开采量或每秒产量。',
  '累计产量达到目标后，「勘探」会解锁新矿层。进入深层可提高所有产量。',
  '在地心遗迹点亮信标可以拿到永久增产的星屑。进度保存在当前浏览器，离开游戏时最多累计 8 小时自动产量。'
]));
ui.sound.addEventListener('click', () => {
  settle(Date.now());
  state.sound = !state.sound;
  renderSound();
  playTone([392, 523], .08);
  save();
});
ui.dialog.addEventListener('close', lightBeacon);
for (const name of ['facilities', 'exploration']) {
  ui[`${name}Tab`].addEventListener('click', () => selectTab(name));
  ui[`${name}Tab`].addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'facilities' : event.key === 'End' ? 'exploration' : name === 'facilities' ? 'exploration' : 'facilities';
    selectTab(next);
    ui[`${next}Tab`].focus();
  });
}
document.addEventListener('keydown', event => {
  if (event.code !== 'Space' || event.ctrlKey || event.altKey || event.metaKey || ui.dialog.open) return;
  if (event.target !== ui.mine && event.target.closest?.('button, input, select, textarea, a, [contenteditable]')) return;
  event.preventDefault();
  mine();
});
document.addEventListener('visibilitychange', () => {
  const now = Date.now();
  settle(now, !document.hidden);
  save(now);
  if (!document.hidden) render();
});
window.addEventListener('pagehide', () => {
  const now = Date.now();
  settle(now);
  save(now);
});

settle(started, true);
save(started);
updateScene();
renderSound();
render();
requestAnimationFrame(draw);
setInterval(() => {
  if (document.hidden) return;
  const now = Date.now();
  settle(now);
  if (dirty && now - lastSave >= 5000) save(now);
  render();
}, 160);
