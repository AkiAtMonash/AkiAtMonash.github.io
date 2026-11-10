// 画面は描くだけ。ルールの判断はすべてサーバー（engine.js）が行い、選択肢を prompt で送ってくる。
// 左右に2つ並べる画面（self.html）では、どちらの席かを URL の seat で指定してつなぐ
const SEAT = new URLSearchParams(location.search).get('seat');
const IN_PANE = SEAT === '0' || SEAT === '1';   // 左右に並べた片側の画面
const socket = IN_PANE ? io({query: {seat: SEAT}}) : io();
const $ = id => document.getElementById(id);
let S = null;

const PHASE = {deck: 'デッキ選択', charge: 'チャージ＆ドロー', main: 'メインフェイズ', attack: 'アタックフェイズ', final: 'ファイナルフェイズ'};
const NEXT = {charge: 'チャージしない', main: 'アタックフェイズへ', attack: 'ファイナルフェイズへ', final: 'ターン終了'};
const TYPE = {monster: 'モンスター', spell: '魔法', item: 'アイテム', impact: '必殺技', flag: 'フラッグ'};

const act = a => socket.emit('act', a);
socket.on('state', s => { S = s; render(); });
// サーバーを再起動すると演出や質問の番号が0から数え直しになり、開いたままの画面では出なくなる。つなぎ直したら読み直す
socket.io.on('reconnect', () => location.reload());

// 最初の画面で「ボットと対戦」か「自分で両方打つ」を選ぶ。遊び方が違うとサーバーそのものが別なので、
// 選んだほうのサーバーへ移る（自分用のサーバーは、止まっていれば /ensure/self で立ててもらう）。
// ボット対戦を選んだときは、そのあと「コーチングで見る（相手の手札も見える）」かどうかも聞く。
// ?mode=bot / ?mode=self で来た画面は、選び終わったものとして閉じる。再読み込みするとまた選べる。
// 左右に並べた片側の画面（?seat=0/1）も、選び終わったものとして扱う（読み直すたびに質問が出ないように）
const MODE_QUERY = new URLSearchParams(location.search).get('mode');
let modePicked = MODE_QUERY || (IN_PANE ? 'self' : '');
let modeStep = modePicked ? 2 : 0;   // 0: 遊び方 1: ボット戦の見え方 2: 決まった
if (MODE_QUERY) {
    // mode だけ消す（coach=1 は残す。画面の作りがコーチング用に変わるため）
    const rest = new URLSearchParams(location.search);
    rest.delete('mode');
    const q = rest.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : ''));
}
const sameHost = port => `${location.protocol}//${location.hostname}:${port}/`;
async function pickMode(m) {
    if (!S) return;
    // 「自分で両方打つ」は、1つのタブに左右2つのプレイ画面を並べる（self.html）
    if (m === 'self') {
        if (S.mode !== 'self') {
            try {
                const r = await fetch('/ensure/self', {method: 'POST'});
                const j = await r.json();
                if (!j.ok) throw new Error(j.error || 'サーバーが起動しませんでした');
            } catch (e) {
                $('mode-note').textContent = `自分で両方打つサーバーを用意できませんでした：${e.message || e}`;
                return;
            }
            location.href = sameHost(S.ports.self) + 'self.html';
            return;
        }
        location.href = '/self.html';
        return;
    }
    if (S.mode === m) {
        if (modeStep === 0 && S.mode === 'bot' && !S.coach) { modeStep = 1; render(); return; }  // 次にコーチングかを聞く
        modePicked = m; render(); return;
    }
    location.href = sameHost(S.ports[m]) + '?mode=' + m;
}
function renderModeChoice() {
    const box = $('mode-choice');
    if (!box) return;
    // 席が決まっている人（1P）だけに、試合が始まる前の盤面で聞く
    const show = !!S && S.me === 0 && S.phase === 'deck' && S.over === null && !modePicked && modeStep < 2;
    box.classList.toggle('active', show);
    if (!show) return;
    const box2 = $('mode-buttons'), note = $('mode-note');
    box2.innerHTML = '';
    const add = (t, f, cls = '') => {
        const x = document.createElement('button');
        x.textContent = t; x.className = cls; x.onclick = f;
        box2.append(x);
    };
    if (S.mode === 'bot' && modeStep === 1) {
        note.textContent = 'コーチングは、相手の手札を見ながら打てる。見ながら打った試合は真似の学習には使わない。';
        add('コーチングで見る', () => { location.href = location.pathname + '?mode=bot&coach=1'; });
        add('ふつうに対戦', () => { modePicked = 'bot'; render(); }, 'primary');
        add('戻る', () => { modeStep = 0; render(); });
        return;
    }
    note.textContent = S.mode === 'bot' ? 'いまはボット対戦のサーバー' : 'いまは自分で両方打つサーバー';
    add('ボットと対戦', () => pickMode('bot'), S.mode === 'bot' ? 'primary' : '');
    add('自分で両方打つ', () => pickMode('self'), S.mode === 'self' ? 'primary' : '');
}

// いまの質問で、盤面のどのカード・置き場をタップすれば答えになるか（キー → 選択肢の番号）
let T = new Map();
// 対抗を決めるときに、演出と質問の帯をどけて盤面を見られるようにする。質問はサーバーが待ったままなので、答えは送られない
let peeking = false, handUp = false;
const setPeeking = v => {
    if (peeking === v) return;
    peeking = v;
    document.body.classList.toggle('peeking', v);
    render();   // ヘッダーの「戻る」アイコンの出し入れも一緒に描き直す
};
const setHandUp = v => {
    handUp = v;
    document.body.classList.toggle('hand-up', v);
    for (const b of document.querySelectorAll('.hand-toggle')) b.textContent = v ? '手札を戻す' : '手札を広げる';
};
function handToggle() {
    const b = document.createElement('button');
    b.className = 'hand-toggle';
    b.textContent = handUp ? '手札を戻す' : '手札を広げる';
    b.onclick = () => setHandUp(!handUp);
    return b;
}
// ゲージのポップアップは、外側をタップしても閉じる（キャンセルできる質問のときだけボタンがある）
$('gauge-pop').onclick = e => { if (e.target === e.currentTarget) { const b = e.currentTarget.querySelector('button'); if (b) b.click(); } };
// 盤面を見ている間は、光っている対象をタップしても答えを送らない（見るだけにする）
const answer = i => { if (!peeking) act({t: 'answer', id: S.prompt.id, i}); };
const areaKey = (owner, area) => `a${owner}:${area}`;
const gaugeKey = (owner, k) => `g${owner}:${k}`;  // ゲージは裏向きなので、上から何枚目かで選ぶ
function buildTargets() {
    T = new Map();
    if (S.prompt && S.prompt.targets) S.prompt.targets.forEach((t, i) => t && T.set(t.uid != null ? `u${t.uid}` : t.gauge != null ? gaugeKey(t.owner, t.gauge) : areaKey(t.owner, t.area), i));
}

// ===== カード =====
// showKw: 場に置いたカードは、『貫通』などのキーワード能力を数値の上に出す
function cardEl(c, {onTap, noZoom, showKw} = {}) {
    const e = document.createElement('div');
    // 選んでいるカード（攻撃に選んだカード、いま選択肢を出しているカード）は3DS版と同じく黄色い枠で光らせる
    const picked = c.uid != null && (S.sel.includes(c.uid) || (S.prompt && S.prompt.card && S.prompt.card.uid === c.uid));
    const targetable = c.uid != null && T.has(`u${c.uid}`) && !peeking;
    e.className = `card ${c.type}${c.rest ? ' rested' : ''}${picked ? ' selected' : ''}${targetable ? ' targetable' : ''}`;
    if (c.uid != null) e.dataset.uid = c.uid;  // カードの動き（moves）で、描き直す前と後の同じカードを見つけるため
    const img = document.createElement('img');
    img.alt = c.name;
    const src = c.img || c.local;  // 日本語版の画像がなければ英語版、どちらもなければ文字で出す
    if (src) img.src = src; else e.classList.add('text-only');
    // 日本語版の画像が読めないときは、元のシミュレーターの英語版画像、それもなければ文字で出す
    img.onerror = () => { if (c.local && img.src.indexOf(c.local) === -1) img.src = c.local; else { img.remove(); e.classList.add('text-only'); } };
    // 日本語版の必殺技は横長の画像（英語版は縦長）。横長なら縦の枠に合わせて回す
    img.onload = () => e.classList.toggle('landscape', img.naturalWidth > img.naturalHeight);
    if (src) e.append(img);
    const name = document.createElement('span');
    name.className = 'card-name';
    name.textContent = c.name;
    e.append(name);
    // 下の帯：キーワード能力（場のカードだけ）と、攻撃力（赤）/打撃力/防御力（青）
    const foot = document.createElement('div');
    foot.className = 'card-foot';
    if (showKw && c.kw && c.kw.length) {
        const kw = document.createElement('span');
        kw.className = 'card-kw';
        kw.textContent = c.kw.join(' ');
        foot.append(kw);
    }
    if (c.pow !== null) {
        const st = document.createElement('span');
        st.className = 'card-stat';
        const part = (cls, v) => { const s = document.createElement('span'); s.className = cls; s.textContent = v; return s; };
        // 細いカードでは「/」のところでだけ折り返す（数字の途中では切らない）
        const sep = () => [document.createTextNode('/'), document.createElement('wbr')];
        st.append(part('stat-pow', c.pow), ...sep(), part('stat-crit', c.crit));
        if (c.def !== null) st.append(...sep(), part('stat-def', c.def));
        foot.append(st);
    }
    if (foot.childNodes.length) e.append(foot);
    if (c.soul) {
        const so = document.createElement('span');
        so.className = 'card-soul';
        so.textContent = `ソウル${c.soul}`;
        // 中身を見られるソウルは、いつでも帯を押して一覧を開ける（表向きのソウルと、自分の設置カード）
        if (c.soulViews && c.soulViews.length) {
            so.classList.add('viewable');
            so.title = 'ソウルの中身を見る';
            so.onclick = ev => {
                ev.stopPropagation();  // カード本体のタップ（攻撃の選択・アップ）にはしない
                showList(`${c.name}のソウル`, c.soulViews);
            };
        }
        e.append(so);
    }
    e.onmouseenter = () => hoverPreview(c, e);
    e.onmouseleave = hidePreview;
    // タップするとカードをアップで見せる。自分の使えるカードなら、サーバーから選択肢が届いてアップの下に並ぶ。
    // 攻撃するカードや攻撃先を選ぶタップ、光っている対象を選ぶタップでは、アップにしない
    e.onclick = () => {
        showPreview(c);
        if (targetable) answer(T.get(`u${c.uid}`));
        else if (noZoom) { if (onTap) onTap(c); }
        else { openZoom(c); if (onTap) switchTo(c, onTap); }
    };
    return e;
}
const backEl = () => { const e = document.createElement('div'); e.className = 'card face-down'; return e; };
// 装備したアイテムはフラッグの上に少しずらして重ねる
function flagStack(flagEl, itemEl) {
    const st = document.createElement('div');
    st.className = 'flag-stack';
    st.append(flagEl);
    if (itemEl) { itemEl.classList.add('on-flag'); st.append(itemEl); }
    return st;
}
// 【設置】した魔法（ミッションカード）は、レフトの手前の「設置」の置き場に並べる
function setRow(cards, opts) {
    const r = document.createElement('div');
    r.className = 'set-row';
    for (const c of cards) r.append(placed(c, opts));
    return r;
}
// ゲージを払うときは、選べるゲージを光らせてタップで選ぶ。選んだゲージは黄色い枠
function gaugeStack(n, owner) {
    const g = document.createElement('div');
    g.className = 'gauge-stack';
    g.style.setProperty('--n', n);
    for (let k = 0; k < n; k++) {
        const b = backEl(), key = gaugeKey(owner, k);
        b.style.setProperty('--i', k);
        if (T.has(key) && !peeking) { b.classList.add('targetable'); b.onclick = e => { e.stopPropagation(); answer(T.get(key)); }; }
        if (owner === S.me && S.gaugePick.includes(k)) b.classList.add('gauge-picked');
        g.append(b);
    }
    return g;
}

// ゲージを払うときは、盤面のゲージゾーンをそのまま大きくしたものを画面の中央に出す。
// 盤面と同じ gaugeStack を拡大して描くので、並び・重なり・上からの順番は変わらない（押す場所の感覚も同じ）。
// 払う枚数とゲージの枚数が同じときは選ぶものが無いので、この画面は出さない（今と同じく帯で決める）。
const gaugePickPrompt = pr => pr && pr.targets && pr.targets.some(t => t && t.gauge != null) ? pr : null;
function hideGaugePop() {
    const el = $('gauge-pop');
    if (!el) return;
    el.classList.remove('active');
    if (el.dataset.key) { el.dataset.key = ''; el.innerHTML = ''; }
}
function showGaugePop(pr) {
    const el = $('gauge-pop');
    if (!el) return;
    const target = pr.targets.find(t => t && t.gauge != null);
    const owner = target.owner, n = S.players[owner].gauge;
    const chosen = owner === S.me ? S.gaugePick.length : 0;
    // 払う枚数はサーバーから来る（古いサーバーでも動くよう、タイトルの「2枚払う」からも読めるようにする）
    const cost = pr.gaugeCost ?? +((/(\d+)枚払う/.exec(pr.title || '') || [])[1] || n);
    const left = Math.max(0, cost - chosen);
    const key = `${pr.id}:${chosen}:${n}`;
    el.classList.add('active');
    if (el.dataset.key === key) return;
    el.dataset.key = key;
    el.innerHTML = '';
    zoomCard = null;  // アップで開いていたカードが上に重ならないようにする

    const box = document.createElement('div');
    box.className = 'gauge-pop-box';
    const head = document.createElement('div');
    head.className = 'gauge-pop-head';
    const title = document.createElement('span');
    title.className = 'gauge-pop-title';
    title.textContent = '使うゲージを選ぼう！';
    const leftEl = document.createElement('span');
    leftEl.className = 'gauge-pop-left';
    leftEl.innerHTML = `あと <b>${left}</b> 枚`;
    head.append(title, leftEl);

    // 盤面のゲージゾーンの大きさを測り、その3倍（広い画面では画面に収まる倍率）で同じ並びを描く
    const tile = document.querySelector(`${sideOf(owner)} .gauge`);
    const w = (tile && tile.clientWidth) || 40, h = (tile && tile.clientHeight) || 86;
    let cw = 45;
    if (tile) {
        const probe = document.createElement('div');
        probe.style.cssText = 'position:absolute;left:0;top:0;width:var(--cw);height:0;visibility:hidden;pointer-events:none';
        tile.append(probe);
        cw = probe.getBoundingClientRect().width || cw;
        probe.remove();
    }
    const k = Math.max(1, Math.min(3, (innerWidth * 0.62) / w, (innerHeight * 0.62) / h));
    const cwz = cw * k, zh = h * k;
    // 横は盤面のゾーンと同じ比率を基本に、カードより極端に広くならないところで止める
    const zw = Math.min(w * k, cwz * 1.3);
    const zone = document.createElement('div');
    zone.className = 'gauge-zoom';
    zone.style.width = `${Math.round(zw)}px`;
    zone.style.height = `${Math.round(zh)}px`;
    zone.style.setProperty('--cw', `${cwz}px`);
    const stack = gaugeStack(n, owner);
    // 選んだ札は、重なりの下に隠れても分かるよう、見えている帯の右端に印を付ける
    if (owner === S.me) for (const k of S.gaugePick) {
        if (k < 0 || k >= n) continue;
        const mark = document.createElement('span');
        mark.className = 'gauge-check';
        mark.style.setProperty('--i', k);
        mark.textContent = '✓';
        stack.append(mark);
    }
    // 盤面と同じ重なり方にして、枠からはみ出さないようさらに詰める（枚数が多いとき）
    const step = Math.min(cwz * 0.4, cwz * 1.3 / n, (zh - 4 - 14 - cwz * 0.8) / Math.max(1, n - 1));
    stack.style.setProperty('--gstep', `${step}px`);
    const label = document.createElement('span');
    label.className = 'zone-label';
    label.textContent = 'ゲージ';
    const num = document.createElement('span');
    num.className = 'zone-count';
    num.textContent = n;
    zone.append(label, stack, num);
    box.append(head, zone);

    const ci = pr.labels.findIndex(l => /キャンセル/.test(l));
    if (ci >= 0) {
        const b = document.createElement('button');
        b.textContent = 'キャンセル';
        b.onclick = () => answer(ci);
        box.append(b);
    }
    el.append(box);
}

function detailHTML(c) {
    const stat = c.type === 'monster' ? `サイズ${c.size}　攻撃力${c.pow}　打撃力${c.crit}　防御力${c.def}`
        : c.type === 'item' ? `攻撃力${c.pow}　打撃力${c.crit}` : '';
    const fallback = c.local ? `if(this.src.indexOf('${c.local}')<0)this.src='${c.local}';else ` : '';
    return `${c.img || c.local ? `<img src="${c.img || c.local}" alt="" onerror="${fallback}this.remove()">` : ''}
        <p><b>${c.name}</b></p>
        <p class="muted">${TYPE[c.type]}${c.counter ? '【対抗】' : ''}　${c.attr.join(' / ')}</p>
        ${stat ? `<p>${stat}</p>` : ''}
        ${c.soulCards && c.soulCards.length ? `<p>ソウル：${c.soulCards.join('、')}</p>` : ''}
        ${c.kw.length ? `<p>${c.kw.map(k => `『${k}』`).join(' ')}</p>` : ''}
        ${c.text.map(t => `<p>${t}</p>`).join('')}`;
}
const showPreview = c => { $('preview').innerHTML = detailHTML(c); };
// マウスのある画面（PC）では、カードにマウスを乗せているあいだ、詳細をカードと反対側の端に浮かせて出す（MTG Arena と同じ）
const canHover = matchMedia('(hover: hover)');
function hoverPreview(c, e) {
    showPreview(c);
    if (!canHover.matches) return;
    const r = e.getBoundingClientRect();
    $('preview').classList.toggle('on-left', r.left + r.width / 2 > innerWidth / 2);
    $('preview').classList.add('show');
}
const hidePreview = () => $('preview').classList.remove('show');

// ===== 場 =====
function tile(cls, label, content) {
    const t = document.createElement('div');
    t.className = `zone mat-tile ${cls}`;
    const l = document.createElement('span');
    l.className = 'zone-label';
    l.textContent = label;
    t.append(l);
    for (const x of [].concat(content || [])) t.append(x);
    return t;
}
function counter(n) { const s = document.createElement('span'); s.className = 'zone-count'; s.textContent = n; return s; }

// 場に新しく置かれたカードには、3DS版と同じく光が弾ける演出を付ける（開いた直後は付けない）
let fieldSeen = null;
const fieldNow = new Set();
function placed(c, opts) {
    const e = cardEl(c, {...opts, showKw: true});
    fieldNow.add(c.uid);
    if (fieldSeen && !fieldSeen.has(c.uid)) e.classList.add('just-placed');
    return e;
}

function side(p, el, mine) {
    el.innerHTML = '';
    const tap = c => act({t: 'card', uid: c.uid});
    const f = p.field;
    const lifeBox = document.createElement('div');
    lifeBox.className = 'life-display';
    lifeBox.textContent = p.life;
    // フラッグとアイテムは同じ置き場。攻撃するカードを選んでいて相手のセンターが空いていれば、相手のフラッグをタップでファイターを攻撃
    const fighterTarget = !mine && S.turn === S.me && S.phase === 'attack' && S.sel.length > 0 && !f.center;
    const flagEl = cardEl(p.flagCard, {onTap: () => fighterTarget && confirmAttack(`${p.name}（ファイター）`, () => act({t: 'fighter'})), noZoom: fighterTarget});
    const attacking = S.turn === S.me && S.phase === 'attack' && S.over === null;  // 攻撃の選択中は、場のカードのタップは選択に使う
    // 相手のモンスターをタップして攻撃するときは、押し間違えないよう「〇〇にアタックする？」を確かめる
    const attackTarget = attacking && !mine && S.sel.length > 0;
    const fieldOpts = {onTap: attackTarget ? c => confirmAttack(c.name, () => tap(c)) : tap, noZoom: attacking};
    flagEl.classList.add('flag-card');
    const tiles = {
        left: tile('left monster-zone', 'レフト', f.left && placed(f.left, fieldOpts)),
        center: tile('center monster-zone', 'センター', f.center && placed(f.center, fieldOpts)),
        right: tile('right monster-zone', 'ライト', f.right && placed(f.right, fieldOpts)),
        flag: tile(`flag${fighterTarget ? ' target' : ''}`, 'フラッグ／アイテム', flagStack(flagEl, f.item && placed(f.item, fieldOpts))),
        set: tile('set', '設置', setRow(p.sets, {onTap: tap, noZoom: attacking})),
        buddy: tile('buddy', 'バディ', cardEl({...p.buddy, rest: p.buddyCalled})),  // バディコールしたら横向きにする
        gauge: tile('gauge', 'ゲージ', [gaugeStack(p.gauge, p.i), counter(p.gauge)]),
        deck: tile('deck deck-style', 'デッキ', [p.deck ? backEl() : '', counter(p.deck)].filter(Boolean)),
        // 一番上のカードはタイルの飾り。タップはドロップ一覧を開くだけにして、カードのアップは出さない
        drop: tile('drop', 'ドロップ', [p.drop.length ? cardEl(p.drop[p.drop.length - 1], {noZoom: true}) : '', counter(p.drop.length)].filter(Boolean)),
        life: tile(`life ${p.i === 0 ? 'P1-theme' : 'P2-theme'}`, `${p.name} ライフ`, lifeBox),
    };
    tiles.drop.onclick = () => p.drop.length && showList(`${p.name} のドロップ`, p.drop);
    tiles.life.dataset.p = p.i;
    // コールするエリアを選ぶときは、出せる置き場を光らせ、置き場をタップで決める
    for (const a of ['left', 'center', 'right']) {
        const k = areaKey(p.i, a);
        if (!T.has(k) || peeking) continue;
        tiles[a].classList.add('targetable');
        tiles[a].addEventListener('click', e => { e.stopPropagation(); answer(T.get(k)); }, true);
    }
    // 置き場の位置は styles.css の grid-template-areas で決める（公式プレイマットの配置。相手側は180度回した点対称の形）
    for (const k in tiles) { tiles[k].style.gridArea = k; el.append(tiles[k]); }
    el.classList.toggle('active-turn', S.turn === p.i);
}

function hand(el, p, mine) {
    el.innerHTML = '';
    const head = document.createElement('span');
    head.className = 'hand-label';
    head.textContent = `${p.name}の手札（${p.handCount}）`;
    el.append(head);
    const row = document.createElement('div');
    row.className = 'hand-row';
    if (p.hand) for (const c of p.hand) row.append(cardEl(c, {onTap: mine ? (c => act({t: 'card', uid: c.uid})) : null}));
    else for (let k = 0; k < p.handCount; k++) row.append(backEl());
    // 自分の手札は扇形に開く。--k は真ん中から何枚目か（左が負）、--n は枚数
    const n = row.children.length;
    row.style.setProperty('--n', n);
    [...row.children].forEach((x, k) => { x.style.setProperty('--k', k - (n - 1) / 2); x.style.setProperty('--k2', (k - (n - 1) / 2) ** 2); });
    el.append(row);
}

// ===== 質問 =====
// 3DS版と同じく盤面を隠さないよう、質問は画面の上に帯で出す。カードの詳細は詳細欄に出し、そのカードは黄色く光らせる
function showPrompt(pr) {
    const bar = $('prompt-bar');
    if (bar.dataset.id === String(pr.id)) return;
    if (peeking) setPeeking(false);  // 新しい質問が来たら、まず帯を出して選択肢を見せる
    bar.dataset.id = pr.id;
    if (pr.cards && pr.cards.some(Boolean)) return showCardChoice(pr);
    bar.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'prompt-title';
    title.textContent = pr.title;
    const box = document.createElement('div');
    box.className = `prompt-buttons${pr.title === 'ジャンケン' ? ' janken' : ''}`;
    // ゲージを選ぶ質問は、場のゲージをタップして選ぶ。ボタンは「キャンセル」だけにする
    const onField = i => pr.targets[i] && pr.targets[i].gauge != null;
    pr.labels.forEach((l, i) => {
        if (onField(i)) return;
        const b = document.createElement('button');
        b.textContent = pr.title === 'ジャンケン' ? `${HAND[i]}\n${l}` : l;
        b.className = /キャンセル|パス|もどる/.test(l) ? '' : 'primary';
        // 押したら選んだボタンを光らせ、ほかは押せなくする（相手の選択を待つあいだも、選べたことが分かるように）
        b.onclick = () => {
            answer(i);
            for (const x of box.querySelectorAll('button')) x.disabled = true;
            b.classList.add('chosen');
            title.textContent = `${pr.title}　…相手を待っています`;
        };
        box.append(b);
    });
    // 対抗を決める質問には、演出と帯をどけて盤面を見るボタンと、手札を広げるボタンを添える
    if (/対抗/.test(pr.title)) {
        const tools = document.createElement('div');
        tools.className = 'prompt-tools';
        const look = document.createElement('button');
        look.textContent = '盤面を見る';
        look.onclick = () => setPeeking(true);
        tools.append(look, handToggle());
        const head = document.createElement('div');
        head.className = 'prompt-head';
        head.append(title, tools);
        bar.append(head, box);
    } else bar.append(title, box);
    bar.classList.add('active');
    if (pr.card) showPreview(pr.card);
}
// ===== カードのアップ =====
// カードの選択肢（コール・キャスト・チャージなど）は、アップにしたカードの下に並べる。取り消しは「戻る」と表示する
let zoomCard = null;
const zoomPrompt = () => S.prompt && S.prompt.card && !S.prompt.targets.some(Boolean) ? S.prompt : null;
function openZoom(c) { zoomCard = c; $('zoom').dataset.key = ''; renderZoom(); }
function closeZoom() { zoomCard = null; renderZoom(); }
function renderZoom() {
    const box = $('zoom'), pr = zoomPrompt(), c = pr ? pr.card : zoomCard;
    if (!c) { box.classList.remove('active'); box.dataset.key = ''; document.body.classList.remove('zooming'); return; }
    const key = pr ? `p${pr.id}` : `c${c.uid}:${c.id}`;
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    $('zoom-card').innerHTML = detailHTML(c);
    $('zoom-title').textContent = pr ? pr.title : '';
    const btns = $('zoom-buttons');
    btns.innerHTML = '';
    const add = (text, cls, fn) => { const b = document.createElement('button'); b.textContent = text; b.className = cls; b.onclick = fn; btns.append(b); };
    if (pr) pr.labels.forEach((l, i) => {
        const back = /キャンセル|もどる/.test(l);
        add(back ? '戻る' : l, back ? '' : 'primary', () => { zoomCard = null; answer(i); });
    });
    else add('戻る', '', closeZoom);
    box.classList.add('active');
    document.body.classList.add('zooming');
}

// 別のカードの選択肢を出しているときに違うカードをタップしたら、今の選択を取り消してからそのカードを選ぶ
// （取り消しのない質問、たとえば【対抗】の「パス／えらぶ」のときはそのまま）
function switchTo(c, onTap) {
    if (peeking) return onTap(c);  // 盤面を見ている間は、質問を取り消さずにカードを開く
    const pr = S.prompt, ci = pr ? pr.labels.findIndex(l => /キャンセル/.test(l)) : -1;
    if (ci < 0 || (pr.card && pr.card.uid === c.uid)) return onTap(c);
    answer(ci);
    setTimeout(() => onTap(c), 120);  // 取り消しの処理が終わってから次のカードを送る
}

// 画面だけで出す確認（サーバーには送らない）。アタックの押し間違いを防ぐ
let localConfirm = null;
function confirmAttack(name, go) {
    localConfirm = {title: `${name}にアタックする？`, go};
    render();
}
function showLocalConfirm() {
    const bar = $('prompt-bar'), lc = localConfirm;
    if (bar.dataset.id === 'local:' + lc.title) return;
    bar.dataset.id = 'local:' + lc.title;
    bar.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'prompt-title';
    title.textContent = lc.title;
    const box = document.createElement('div');
    box.className = 'prompt-buttons';
    const add = (text, cls, fn) => { const b = document.createElement('button'); b.textContent = text; b.className = cls; b.onclick = fn; box.append(b); };
    add('アタック', 'primary', () => { localConfirm = null; lc.go(); render(); });
    add('キャンセル', '', () => { localConfirm = null; render(); });
    bar.append(title, box);
    bar.classList.add('active');
}

// 場にないカード（ソウルなど）から選ぶ質問は、カードを並べてタップで選ばせる。カードのない選択肢はボタンにする
function showCardChoice(pr) {
    $('prompt-title').textContent = pr.title;
    $('prompt-card').innerHTML = '';
    const box = $('prompt-buttons');
    box.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'list-grid';
    const pickIt = i => { $('prompt').classList.remove('active'); answer(i); };
    pr.labels.forEach((l, i) => {
        const c = pr.cards[i];
        if (c) grid.append(cardEl(c, {onTap: () => pickIt(i), noZoom: true}));
        else { const b = document.createElement('button'); b.textContent = l; b.onclick = () => pickIt(i); box.append(b); }
    });
    box.prepend(grid);
    $('prompt').classList.add('active');
}
function hidePrompt() { const bar = $('prompt-bar'); bar.classList.remove('active'); bar.dataset.id = ''; }
function showList(title, cards) {
    $('prompt-title').textContent = title;
    $('prompt-card').innerHTML = '';
    const box = $('prompt-buttons');
    box.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'list-grid';
    for (const c of cards) grid.append(cardEl(c));
    const close = document.createElement('button');
    close.textContent = '閉じる';
    close.onclick = () => $('prompt').classList.remove('active');
    box.append(grid, close);
    $('prompt').classList.add('active');
}

// ===== 場の真ん中：魔法・必殺技を使っているとき、攻撃しているとき =====
// 魔法・必殺技は3DS版と同じく「キャスト」の帯を出し、カードを場の真ん中に置く。必殺技は横向き
function renderCenter() {
    const layer = $('cast-layer');
    const top = S.casting[S.casting.length - 1], b = S.battle;
    const key = top ? `c${top.card.uid}:${top.ability}:${S.casting.length}`
        : b ? `b${b.atk.map(c => c.uid)}:${b.target && b.target.uid}:${b.pow}:${b.crit}:${b.def}:${b.nullified}` : '';
    if (layer.dataset.key === key) return;  // 変わっていなければ作り直さない（動きが最初からにならないように）
    layer.dataset.key = key;
    layer.innerHTML = '';
    if (!top) { if (b) layer.append(faceoff(b)); return; }
    // 能力の発動は「能力発動」の帯とそのカード（場のカードはレストしていても縦に見せる）
    const impact = !top.ability && top.card.type === 'impact';
    const band = document.createElement('div');
    band.className = `cast-band${impact ? ' impact' : ''}${top.ability ? ' ability' : ''}`;
    band.textContent = `${top.by}：${top.ability ? '能力発動' : impact ? '必殺技' : 'キャスト'}　${top.card.name}`;
    const card = cardEl({...top.card, rest: false});
    card.classList.add('cast-card');
    if (impact) card.classList.add('sideways');
    layer.append(band, card);
    // 能力の発動はその能力の文章、魔法・必殺技はカードの効果文を、カードの下に出す
    const lines = top.ability ? top.text : top.card.text;
    if (lines && lines.length) {
        const t = document.createElement('div');
        t.className = `cast-text${impact ? ' impact' : top.ability ? '' : ' spell'}`;
        for (const line of lines) { const l = document.createElement('div'); l.textContent = line; t.append(l); }
        layer.append(t);
    }
}
// 攻撃の対決：左に攻撃側（攻撃力・打撃力）、右に受ける側（防御力。ファイターなら「ファイター」）
function faceoff(b) {
    const el = document.createElement('div');
    el.className = 'faceoff';
    const sideEl = (cards, badge, cls) => {
        const w = document.createElement('div');
        w.className = `faceoff-side ${cls}`;
        const row = document.createElement('div');
        row.className = 'faceoff-cards';
        for (const c of cards) row.append(cardEl({...c, rest: false}));  // 攻撃でレストしていても、対決では縦に見せる
        const bd = document.createElement('div');
        bd.className = 'faceoff-badge';
        bd.innerHTML = badge;
        w.append(row, bd);
        return w;
    };
    const left = sideEl(b.atk, `攻撃力 <b>${b.pow}</b><br>打撃力 <b>${b.crit}</b>`, 'atk');
    const right = b.fighter ? sideEl([], `<b>ファイター</b><br>${b.fighter}`, 'def')
        : sideEl(b.target ? [b.target] : [], `防御力 <b>${b.def === null ? '-' : b.def}</b>`, 'def');
    const vs = document.createElement('div');
    vs.className = 'faceoff-vs';
    vs.textContent = b.nullified ? '無効化' : 'VS';
    el.append(left, vs, right);
    return el;
}

// ===== 帯・カットイン・ダメージの演出（engine の fx を順に流す） =====
let fxSeen = null, fxBusy = false;
const HAND = ['✊', '✌️', '✋'];  // ジャンケンの手（グー・チョキ・パー）
const fxQueue = [];
const wait = ms => new Promise(r => setTimeout(r, ms));
function queueFx() {
    if (fxSeen === null) { fxSeen = S.fx.length ? S.fx[S.fx.length - 1].seq : 0; return; }  // 開いたときに過去の演出は流さない
    for (const f of S.fx) if (f.seq > fxSeen) { fxQueue.push(f); fxSeen = f.seq; }
    // たまりすぎたら古いものから飛ばす。フェイズの帯はルールの切れ目なので飛ばさない（相手が速く進めても全部見える）
    const isBand = f => f.kind === 'phase' || f.kind === 'turnend';
    while (fxQueue.length > 5) { const k = fxQueue.findIndex(f => !isBand(f)); if (k === -1) break; fxQueue.splice(k, 1); }
    if (!fxBusy) playFx();
}
async function playFx() {
    fxBusy = true;
    while (fxQueue.length) await showFx(fxQueue.shift());
    fxBusy = false;
}
async function showFx(f) {
    const layer = $('fx-layer');
    const el = document.createElement('div');
    if (f.kind === 'phase' || f.kind === 'turnend') {
        el.className = `fx-band ${f.kind}`;
        el.innerHTML = `${f.sub ? `<small>${f.sub}</small>` : ''}${f.text}`;
    } else if (f.kind === 'call' || f.kind === 'equip') {
        el.className = `fx-cutin ${f.kind}`;
        const t = document.createElement('div');
        t.className = 'fx-cutin-text';
        t.innerHTML = `<small>${f.by}</small>${f.text}`;
        const c = cardEl(f.card);
        c.classList.add('fx-cutin-card');
        el.append(t, c);
    } else if (f.kind === 'damage' || f.kind === 'heal') {
        const tileEl = document.querySelector(`.life[data-p="${f.to}"]`);
        if (!tileEl) return;
        const r = tileEl.getBoundingClientRect();
        el.className = `fx-number ${f.kind}`;
        el.textContent = f.kind === 'damage' ? `${f.text}↓` : f.text;
        el.style.left = `${r.left + r.width / 2}px`;
        el.style.top = `${r.top + r.height / 2}px`;
        layer.append(el);
        setTimeout(() => el.remove(), 1400);
        return wait(500);
    } else if (f.kind === 'janken') {
        // 自分の手を左、相手の手を右に並べ、自分から見た勝ち負けを大きく出す（観戦者には P1・P2 の手）
        const me = S.me === 1 ? 1 : 0, mine = f.hands[me], theirs = f.hands[1 - me];
        const result = mine === theirs ? 'あいこ' : S.me === -1 ? `P${(theirs - mine + 3) % 3 === 1 ? 1 : 2}の勝ち` : (theirs - mine + 3) % 3 === 1 ? '勝ち！' : '負け…';
        el.className = 'fx-janken';
        el.innerHTML = `<div class="janken-hands"><div><small>${S.me === -1 ? 'P1' : '自分'}</small><span>${HAND[mine]}</span></div>`
            + `<b>VS</b><div><small>${S.me === -1 ? 'P2' : '相手'}</small><span>${HAND[theirs]}</span></div></div><div class="janken-result">${result}</div>`;
        layer.append(el);
        await wait(1900);
        el.remove();
        return;
    } else if (f.kind === 'chat') {
        el.className = 'fx-chat';
        el.textContent = `${f.by}「${f.text}」`;
        layer.append(el);
        setTimeout(() => el.remove(), 2500);
        return;
    } else return;
    layer.append(el);
    await wait(f.kind === 'phase' || f.kind === 'turnend' ? 900 : 1100);
    el.remove();
}

// ===== カードの動き =====
// 3DS版のように、カードを引く・ゲージに置く・使う／コール／装備・ドロップへ行くときに、カードが移動して見えるようにする。
// 描き直す前に盤面のカードと置き場の位置を覚えておき、描き直した後に同じカード（uid）が別の場所にあれば、前の場所から飛ばす。
// 見えないカード（ゲージ・相手の手札）は枚数の増減から、裏向きのカードを飛ばす。
const MOVE_SEL = '.player-field .card[data-uid], .hand-bar .card[data-uid], #cast-layer > .card[data-uid]';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let lastCounts = null;
const sideOf = i => (i === (S.me === -1 ? 0 : S.me) ? '#bottom' : '#top');
const handOf = i => (i === (S.me === -1 ? 0 : S.me) ? '#my-hand' : '#opponent-hand');
const rectOf = sel => { const e = document.querySelector(sel); return e && e.getBoundingClientRect(); };
function snapshot() {
    if (!S || !lastCounts) return null;
    const rects = new Map(), inHand = new Set();
    for (const e of document.querySelectorAll(MOVE_SEL)) if (!rects.has(e.dataset.uid)) {
        rects.set(e.dataset.uid, e.getBoundingClientRect());
        if (e.closest('.hand-bar')) inHand.add(e.dataset.uid);
    }
    // 置き場は、カード1枚ぶんの大きさの位置（デッキの一番上、手札の最後のカード、ゲージの一番下のカード）
    const zones = [0, 1].map(i => ({deck: rectOf(`${sideOf(i)} .deck .card`), hand: rectOf(`${handOf(i)} .hand-row .card:last-child`),
        gauge: rectOf(`${sideOf(i)} .gauge-stack .card:last-child`)}));
    return {rects, inHand, zones, counts: lastCounts};
}
// el を from の位置から今の位置へ飛ばす。ghost を渡したときは、それを飛ばして el は最後に見せる
function fly(el, from, ghost) {
    const to = el.getBoundingClientRect();
    if (!from || !to.width || Math.hypot(from.left - to.left, from.top - to.top) < 8) return;
    const g = ghost || el.cloneNode(true);
    g.classList.add('flying');
    Object.assign(g.style, {left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`});
    $('fx-layer').append(g);
    el.style.visibility = 'hidden';
    const sx = from.width / to.width || 1, sy = from.height / to.height || 1;
    g.animate([{transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`}, {transform: 'none'}],
        {duration: 450, easing: 'cubic-bezier(.2, .7, .3, 1)'}).onfinish = () => { g.remove(); el.style.visibility = ''; };
}
function animateMoves(before) {
    const counts = S.players.map(p => ({hand: p.handCount, gauge: p.gauge, drop: p.drop.length}));
    const prev = before && before.counts;
    lastCounts = counts;
    if (!before || reduceMotion.matches) return;
    const ownerOf = el => { const s = el.closest('#top, #bottom, #my-hand, #opponent-hand'); if (!s) return null;
        const mine = S.me === -1 ? 0 : S.me; return s.id === 'bottom' || s.id === 'my-hand' ? mine : 1 - mine; };
    const seen = new Set();
    for (const el of document.querySelectorAll(MOVE_SEL)) {
        const uid = el.dataset.uid;
        if (seen.has(uid)) continue;
        seen.add(uid);
        let from = before.rects.get(uid);
        if (!from) {
            // 新しく見えたカードは、どこから来たかを置き場と枚数の増減から決める
            const i = ownerOf(el), z = i === null ? before.zones[1 - (S.me === -1 ? 0 : S.me)] : before.zones[i];
            if (el.closest('.hand-bar')) from = z.deck;                                                  // 引いた
            else if (el.closest('.drop')) from = prev[i].gauge > counts[i].gauge ? z.gauge : prev[i].hand > counts[i].hand ? z.hand : null;  // 払ったゲージ・捨てた手札
            else from = z.hand;                                                                            // 相手が手札から使った・コールした
        }
        fly(el, from);
    }
    // 見えない移動：ゲージが増えた（手札からチャージ、デッキの上から）・相手の手札が増えた（引いた）
    // 自分の手札から消えたカードがあれば、ゲージへはそのカードの位置から飛ばす
    const gone = [...before.inHand].filter(uid => !seen.has(uid)).map(uid => before.rects.get(uid));
    for (const i of [0, 1]) {
        const z = before.zones[i];
        const g = counts[i].gauge - prev[i].gauge;
        if (g > 0) [...document.querySelectorAll(`${sideOf(i)} .gauge-stack .card`)].slice(-g)
            .forEach(el => fly(el, prev[i].hand > counts[i].hand ? (handOf(i) === '#my-hand' && gone.shift()) || z.hand : z.deck, backEl()));
        const h = counts[i].hand - prev[i].hand;
        if (h > 0 && handOf(i) === '#opponent-hand') [...document.querySelectorAll('#opponent-hand .hand-row .card')].slice(-h)
            .forEach(el => fly(el, z.deck, backEl()));
    }
}

// ===== 決着 =====
let resultClosed = false;
let matchReports = null, matchReportsFor = null;
const REPORT_STATE = {
    received: '受付', fixing: '調べている', done: '完了', stopped: '要確認', skipped: '記録のみ',
    bug: '修正済み', 'as-specified': '仕様どおり', ambiguous: '要確認', unreproducible: '要確認',
    puzzle: '問題を追加', already: 'すでにできている', unclear: '要確認', disagree: '見送り',
};
function renderResult() {
    const box = $('result');
    if (S.over === null) {
        resultClosed = false; matchReports = null; matchReportsFor = null;
        box.classList.remove('active'); return;
    }
    if (resultClosed) { box.classList.remove('active'); return; }
    const won = S.over === S.me;
    box.innerHTML = '';
    const big = document.createElement('div');
    big.className = `result-big ${S.me === -1 ? '' : won ? 'win' : 'lose'}`;
    big.textContent = S.me === -1 ? `${S.players[S.over].name} の勝利` : won ? '勝利！' : '敗北…';

    // その試合に出した指摘と、いまの状態。中身は issue に書いてあるので、ここは入口だけ
    const list = document.createElement('div');
    list.className = 'result-reports';
    if (matchReports && matchReports.length) {
        const title = document.createElement('div');
        title.className = 'result-reports-title';
        title.textContent = `この試合の修正依頼（${matchReports.length}件）`;
        list.append(title);
        for (const r of matchReports) {
            const a = document.createElement('a');
            a.className = 'result-report';
            a.href = r.issueUrl || '#';
            a.target = '_blank';
            a.rel = 'noopener';
            const st = document.createElement('span');
            st.className = `result-report-status ${r.verdict || r.status || ''}`;
            st.textContent = REPORT_STATE[r.verdict] || REPORT_STATE[r.status] || '受付';
            const tx = document.createElement('span');
            tx.className = 'result-report-text';
            tx.textContent = r.text || '(一言なし)';
            a.append(st, tx);
            list.append(a);
        }
    }

    const row = document.createElement('div');
    row.className = 'result-buttons';
    if (S.me !== -1) { const again = document.createElement('button'); again.className = 'primary'; again.textContent = '新しいゲーム'; again.onclick = () => act({t: 'new'}); row.append(again); }
    box.append(big, list, row);
    box.classList.add('active');

    // 取れていなければ、取ってから描き直す
    if (matchReports === null && matchReportsFor !== S.over) {
        matchReportsFor = S.over;
        // 古いサーバー（この入口がまだ無い）でも、直近の指摘だけは出す
        const load = async () => {
            let res = await fetch('/coach/match-reports');
            if (!res.ok) res = await fetch('/coach/reports?limit=5');
            const d = await res.json();
            return d.reports || [];
        };
        load().then(list => {
            matchReports = list;
            if (S.over !== null && !resultClosed) renderResult();
        }).catch(() => { matchReports = []; });
    }
}
// 外側をタップしたら閉じる（盤面を見たいとき用）
document.getElementById('result').addEventListener('click', e => {
    if (e.target.id !== 'result') return;
    resultClosed = true;
    renderResult();
});

// ===== 全体 =====
function render() {
    const before = snapshot();
    const mine = S.me === -1 ? 0 : S.me;
    const me = S.players[mine], op = S.players[1 - mine];
    const myTurn = S.turn === S.me;
    // スマホでは「〇ターン目」と「だれの何フェイズか」を2行に分ける（見出しを1行に収めるため）
    const ph = $('phase-indicator');
    ph.innerHTML = '';
    const part = t => { const s = document.createElement('span'); s.textContent = t; ph.append(s); };
    if (S.over !== null) part(`${S.players[S.over].name} の勝ち！`);
    else { part(`${S.turnNo}ターン目　`); part(`${S.players[S.turn].name}：${PHASE[S.phase]}`); }

    const btns = $('buttons');
    btns.innerHTML = '';
    const btn = (t, f, cls = '') => { const b = document.createElement('button'); b.textContent = t; b.className = cls; b.onclick = f; btns.append(b); };
    // 押し間違えたときに1手だけ戻せる（自分のターンで、盤面が止まっているときだけ出る）。
    // 「アタックフェイズへ」「ファイナルフェイズへ」の文字の長さで位置が動かないよう、フェイズのボタンとは別に画面の左端へ置く
    const undo = $('undo-slot');
    undo.innerHTML = '';
    if (S.canUndo) { const b = document.createElement('button'); b.textContent = '1手戻す'; b.onclick = () => act({t: 'undo'}); undo.append(b); }
    if (myTurn && S.over === null && NEXT[S.phase]) {
        btn(NEXT[S.phase], () => act({t: 'next'}), S.phase === 'attack' && S.sel.length ? '' : 'primary');
    }
    // 「新しいゲーム」はめったに使わず押し間違えると困るので、ログと一緒に「メニュー」の引き出しに入れる
    btn('メニュー', e => { document.body.classList.toggle('log-open'); e.currentTarget.classList.toggle('on'); }, document.body.classList.contains('log-open') ? 'on' : '');
    // 盤面を見ている間は、ヘッダーの右端に「対抗の確認に戻る」アイコンを出す（盤面に重ねない）
    if (peeking) {
        const b = document.createElement('button');
        b.className = 'peek-back';
        b.title = '対抗の確認に戻る';
        b.setAttribute('aria-label', '対抗の確認に戻る');
        b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.6 12s3.4-6 9.4-6 9.4 6 9.4 6-3.4 6-9.4 6S2.6 12 2.6 12Z"/><circle cx="12" cy="12" r="2.7"/><path d="M4.3 4.5l15.4 15"/></svg>';
        b.onclick = () => setPeeking(false);
        btns.append(b);
    }
    const menu = $('menu-buttons');
    menu.innerHTML = '';
    if (S.me !== -1) {
        const b = document.createElement('button');
        b.textContent = '新しいゲーム';
        b.onclick = () => confirm('最初からやり直しますか？') && act({t: 'new'});
        menu.append(b);
    }


    buildTargets();
    hidePreview();  // 描き直すとマウスを乗せていたカードが消え、離れたことが伝わらないため
    fieldNow.clear();
    side(op, $('top'), false);
    side(me, $('bottom'), true);
    fieldSeen = new Set(fieldNow);
    hand($('opponent-hand'), op, false);
    hand($('my-hand'), me, true);
    $('log').innerHTML = S.log.map(s => `<div>${s}</div>`).join('');
    renderCenter();
    queueFx();
    renderResult();
    animateMoves(before);

    if (localConfirm && (S.prompt || S.turn !== S.me || S.phase !== 'attack' || !S.sel.length)) localConfirm = null;  // 場面が変わったら確認は取り下げる
    // 質問が終わったら、盤面を見るモードと広げた手札を元に戻す
    if (!S.prompt) { if (peeking) setPeeking(false); if (handUp) setHandUp(false); }
    // ゲージを選ぶ質問は、盤面のゲージゾーンを大きくしたポップアップで選ばせる（帯は出さない）
    const gp = gaugePickPrompt(S.prompt);
    if (gp && !peeking) { hidePrompt(); showGaugePop(gp); }
    else {
        hideGaugePop();
        if (S.prompt && !zoomPrompt()) showPrompt(S.prompt); else if (localConfirm) showLocalConfirm(); else hidePrompt();
    }
    renderZoom();
    renderModeChoice();
}
