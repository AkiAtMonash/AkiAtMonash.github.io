// ルールエンジン。状態はすべてサーバー側で持ち、プレイヤーへの質問は pending に置いて答えを待つ。
// カードデータは公式カードリスト（fc-buddyfight.com）。ルールは 2018/6/2 の改定より前のものを正とし、公式の詳細ルール ver.2.01（2016/1/22）に合わせている。
// 改定前の基本ルール（先攻1ターン目のドローなど）は、詳細ルール ver.3.10 の「2018/6/2 適用 ルール変更について」から逆にたどった。

const AREAS = ['left', 'center', 'right'];
const AN = {left: 'レフト', center: 'センター', right: 'ライト', item: 'アイテム'};
// 日本語版の画像は public/cardImages/jp/ に保存したものを使う（fetch-images.js、または Fandom wiki から保存）
// 保存していない画像は送らない（画面では文字だけのカードになる）。あとから足した画像もサーバーを止めずに使えるよう、無いことは覚えない
const fs = require('fs'), path = require('path');
const imgSeen = new Set();
// カード番号から公式サイトの画像のファイル名：TD01/0001 → td_01_0001.webp、PR/0053 → pr_0053.webp
// 配信サイトでは jp の画像を WebP に変換して置いている（90MB→10MB にして転送とデプロイを軽くするため）
const imgFile = id => {
  const s = id.toLowerCase(), m = s.match(/^([a-z]+)(?:-([a-z]+))?(\d*)\/(\d{4})$/);
  if (!m) return `${s.replace('/', '_')}.webp`;
  const [, a, b, n, k] = m;
  return `${a}${b || ''}${n ? `_${n}` : ''}_${k}.webp`;
};
const OFFICIAL_IMG = id => {
  const f = imgFile(id);
  if (!imgSeen.has(f) && fs.existsSync(path.join(__dirname, 'public', 'cardImages', 'jp', f))) imgSeen.add(f);
  return imgSeen.has(f) ? `/cardImages/jp/${f}` : '';
};

const remove = (a, x) => a.splice(a.indexOf(x), 1);

// スタートデッキ（set）は15種で50枚。バディの1枚をバディゾーンに置き、代わりに「俺のバディ！」をデッキに入れて50枚。
// 2014年の世界大会の優勝デッキ（cards）は、公式のデッキレシピ（英語版）の50枚をデッキにし、バディを別に1枚置く。
// カード番号は英語版のレシピの番号。効果文・カード名・属性は公式カードリスト（fc-buddyfight.com）の日本語テキストをそのまま使う。
// 一部のカードは日本語版の番号が違う（番号ではなくカード名で引いた）：
//   BT03/0024→EB01/0048、BT01/0079→ZD01/0009、EB01/0013→BT02/0105、BT01/0044→PR/0013、
//   PR/0053→PR/0050、PR/0031→PR/0046、PR/0054→PR/0052、PR/0026→PR/0031
const GREETINGS = ['対戦ありがとうございました！', 'いいファイトでした', '楽しかったよ', 'もう一回やろう！'];

const DECKS = [
  {name: '強ドラ', flag: 'ドラゴンワールド', set: 'TD01', buddy: 'TD01/0003', local: 'dragonWorld'},
  {name: 'フォージング・ブラッド', flag: 'デンジャーワールド', set: 'TD02', buddy: 'TD02/0003', local: 'dangerWorld'},
  // 2014年 世界大会 決勝 優勝（They Yuan Qi）
  {name: '迅雷騎士団', flag: 'ドラゴンワールド', flagSet: 'TD01', local: 'dragonWorld', buddy: 'BT03/0026', cards: {
    'BT04/0001': 2, 'BT03/0024': 3, 'BT03/0002': 3, 'CP01/0004': 4, 'BT03/0026': 4, 'BT03/0047': 3, 'BT03/0080': 4,
    'BT01/0024': 4, 'BT01/0079': 3, 'BT02/0079': 2, 'TD01/0012': 3, 'CP01/0040': 3, 'BT03/0027': 2,
    'BT01/0011': 4, 'EB01/0001': 2, 'TD01/0015': 4}},
  // 2014年 世界大会 北アメリカ大陸予選 優勝（Carlos Rodriguez）
  {name: '勇者ドラム', flag: 'ダンジョンワールド', buddy: 'BT03/0036', cards: {
    'BT03/0017': 2, 'BT03/0036': 4, 'BT03/0037': 3, 'TD04/0005': 4, 'BT03/0008': 3, 'BT03/0018': 4, 'TD04/0009': 2, 'BT03/0100': 2,
    'TD04/0012': 4, 'TD04/0015': 4, 'TD04/0016': 3, 'BT03/0041': 3, 'BT03/0042': 3, 'BT03/0068': 4,
    'BT03/0020': 3, 'TD04/0019': 2}},
  // 2014年 世界大会 フィリピン予選 優勝（Jomer Yap Flores）
  {name: 'デュエルズィーガー', flag: 'エンシェントワールド', buddy: 'EB01/0013', cards: {
    'EB01/0002': 2, 'EB01/0012': 4, 'EB01/0013': 4, 'EB01/0022': 3, 'EB01/0038': 4, 'PR/0053': 4, 'EB01/0005': 2,
    'BT01/0044': 3, 'EB01/0007': 4, 'EB01/0016': 4, 'EB01/0026': 2, 'EB01/0027': 4, 'EB01/0044': 4, 'PR/0031': 3, 'PR/0054': 3}},
  // 2014年 世界大会 アメリカ（テキサス）予選 優勝（Christian Rodriguez）。公式のレシピは51枚なので、パワーレイ・マキシマムを1枚減らした
  {name: 'メアリー・スー', flag: 'マジックワールド', buddy: 'BT02/0002', cards: {
    'BT03/0053': 2, 'BT01/0005': 2, 'BT02/0002': 4, 'BT01/0014': 4, 'BT02/0024': 4, 'BT02/0025': 4, 'BT03/0004': 1, 'PR/0026': 2,
    'BT01/0015': 3, 'BT01/0031': 4, 'BT02/0003': 2, 'BT02/0026': 4, 'BT02/0027': 4, 'BT02/0028': 4, 'BT02/0054': 4, 'BT03/0032': 1,
    'BT01/0034': 1}},
  // 令和のバディファイト「煉獄騎士VS爆竜牙」の煉獄騎士（視聴者から聞いたリスト）
  {name: '断罪 煉獄騎士団', flag: 'ダークネスドラゴンワールド', buddy: 'BT05/0046', cards: {
    'BT05/0046': 4, 'BT05/0010': 4, 'BT05/0024': 4, 'PP01/0039': 4, 'BT05/0118': 1, 'BT05/0121': 1, 'BT05/0023': 1, 'BT05/0049': 1,
    'BT04/0042': 4, 'BT05/0025': 4, 'BT04/0101': 4, 'TD06/0015': 3, 'BT04/0041': 3, 'BT05/0082': 3, 'BT05/0076': 1,
    'BT05/0052': 2, 'BT05/0085': 4, 'BT05/0053': 2}},
  // 令和のバディファイト「煉獄騎士VS爆竜牙」の爆竜牙（視聴者から聞いたリスト）
  {name: '爆竜牙', flag: 'ドラゴンワールド', buddy: 'BT01/0021', cards: {
    'BT01/0021': 4, 'BT05/0002': 4, 'SS01/0004': 4, 'PR/0129': 4, 'TD01/0005': 4, 'TD01/0007': 2, 'EB01/0019': 2,
    'SS01/0008': 4, 'BT05/0029': 2, 'TD01/0012': 4, 'BT01/0024': 4, 'BT03/0088': 4, 'TD01/0011': 3, 'CP01/0040': 1,
    'BT01/0011': 4, 'EB01/0001': 1, 'H-BT01/0003': 1}},
  // 令和のバディファイト「大盾VS竜騎士」の月影大盾（視聴者から聞いたリスト）
  {name: '月影大盾', flag: 'カタナワールド', buddy: 'PR/0063', cards: {
    'PR/0063': 4, 'BT02/0017': 4, 'PR/0178': 2, 'BT02/0038': 4, 'BT02/0037': 4, 'BT02/0018': 2, 'BT02/0098': 1,
    'BT02/0063': 4, 'BT03/0059': 4, 'BT02/0064': 3, 'EB01/0033': 2, 'EB01/0034': 2, 'BT02/0044': 4, 'PR/0014': 4,
    'PR/0055': 4, 'BT05/0006': 1, 'BT02/0008': 1}},
  // 令和のバディファイト「大盾VS竜騎士」の竜騎士（視聴者から聞いたリスト）
  {name: '竜騎士', flag: 'ドラゴンワールド', buddy: 'CP01/0012', cards: {
    'CP01/0012': 4, 'BT01/0009': 4, 'CP01/0020': 2, 'BT05/0012': 2, 'CP01/0011': 4, 'BT05/0058': 4, 'BT02/0009': 2,
    'CP01/0002': 2, 'TD01/0012': 4, 'BT01/0024': 4, 'BT05/0096': 2, 'BT01/0050': 2, 'EB02/0035': 1, 'BT05/0004': 4,
    'CP01/0013': 2, 'BT05/0061': 4, 'CP01/0014': 3}},
];

// castDelay: 魔法・必殺技を使ったとき、両者に見せるため効果の前後で待つミリ秒（テストでは0）
// botSeat: 外から操作する席（BOT_SEAT）。その席にはデッキを聞かず、もう一方の人が「ランダム」か指定で決める
function createGame(onChange = () => {}, {castDelay = 1500, botSeat = -1, state = null, seed = null} = {}) {
  let G, uid = 0, busy = false, promptSeq = 0, fxSeq = 0, lastIdle = {snap: null, acts: []};
  // 「1手戻す」の戻り先。人が操作を始めた時点の盤面を積む（ボットの手と前のターンは積まない）
  let undoStack = [];
  const nextRng = () => {
    if (!G || typeof G.rng !== 'number') return Math.random();
    let a = G.rng = (G.rng + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = nextRng() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const sleep = ms => ms > 0 ? new Promise(r => setTimeout(r, ms)) : Promise.resolve();
  const pending = [null, null];

  // ===== カードデータ =====
  const D = {};
  // local: 元のシミュレーターに入っていた英語版の画像（日本語版の画像が読めないときの予備）
  // W: いま定義しているカードのワールド（天竺 総一朗の「＜マジックワールド＞の魔法」の判定に使う）
  let W = 'ドラゴンワールド';
  const def = (id, o) => D[id] = {id, attr: [], kw: [], cost: {}, text: [], world: W, ...o};

  def('TD01/0001', {name: 'ギガントソード・ドラゴン', type: 'monster', size: 3, pow: 8000, crit: 4, def: 8000, attr: ['武装騎竜', '赤竜'], cost: {gauge: 3}, n: 2, local: 'gigantSwordDragon',
    text: ['■【コールコスト】ゲージ３を払う。']});
  def('TD01/0002', {name: 'ジャマダハル・ドラゴン', type: 'monster', size: 2, pow: 8000, crit: 2, def: 4000, attr: ['武装騎竜', '緑竜'], n: 4, local: 'jamadharDragon'});
  def('TD01/0003', {name: 'ライジングフレア・ドラゴン', type: 'monster', size: 2, pow: 5000, crit: 2, def: 4000, attr: ['武装騎竜', '赤竜'], cost: {gauge: 2}, n: 4,
    text: ['■【コールコスト】ゲージ２を払う。', '■このカードが登場した時、相手の場のサイズ２以下のモンスター１枚を破壊する！'],
    onEnter: async p => { const t = monsters(foe(p)).filter(c => sizeOf(c) <= 2); if (t.length) await destroy(await pick(p, '破壊する相手のモンスターを選ぶ', t)); }});
  def('TD01/0004', {name: 'エクストリームソード・ドラゴン', type: 'monster', size: 2, pow: 5000, crit: 3, def: 4000, attr: ['武装騎竜', '赤竜'], n: 3, local: 'extremeSwordDragon'});
  def('TD01/0005', {name: 'サウザンドレイピア・ドラゴン', type: 'monster', size: 1, pow: 5000, crit: 2, def: 1000, attr: ['武装騎竜', '白竜'], n: 4, local: 'thousandRapierDragon'});
  def('TD01/0006', {name: 'ベアトラップファング・ドラゴン', type: 'monster', size: 1, pow: 4000, crit: 2, def: 2000, attr: ['武装騎竜', '赤竜'], n: 4, local: 'bearTrapFangDragon'});
  def('TD01/0007', {name: 'システミックダガー・ドラゴン', type: 'monster', size: 1, pow: 3000, crit: 2, def: 3000, attr: ['武装騎竜'], n: 4, local: 'systemicDaggerDragon'});
  def('TD01/0008', {name: 'ブロンズシールド・ドラゴン', type: 'monster', size: 1, pow: 2000, crit: 1, def: 6000, attr: ['武装騎竜', '緑竜'], n: 2, local: 'bronzeShieldDragon'});
  def('TD01/0009', {name: 'ドラゴニック・グリモ', type: 'spell', attr: ['金竜', 'ドロー'], n: 4, local: 'dragonicGrimoire',
    text: ['■君のライフが５以下なら使える。', '■君の手札全てを捨て、カード３枚を引く！「ドラゴニック・グリモ」は１ターンに１回だけ使える。（捨てる手札が０枚でも使えるぞ！）'],
    can: p => G.phase === 'main' && p.life <= 5 && p.used.grimo !== G.turnNo,
    play: async p => { p.used.grimo = G.turnNo; p.drop.push(...p.hand.splice(0)); draw(p, 3); }});
  def('TD01/0010', {name: 'ドラゴン・ブレス', type: 'spell', counter: true, attr: ['ドラゴン'], cost: {gauge: 1}, n: 2, local: 'dragonBreath',
    text: ['■【使用コスト】ゲージ１を払う。', '■【対抗】場の攻撃力4000以下のモンスター１枚を破壊する！'],
    can: () => allMonsters().some(c => val(c, 'pow') <= 4000),
    play: async p => destroy(await pick(p, '破壊するモンスターを選ぶ', allMonsters().filter(c => val(c, 'pow') <= 4000)))});
  def('TD01/0011', {name: 'ドラゴエナジー', type: 'spell', counter: true, attr: ['ドラゴン'], n: 4, local: 'dragoenergy',
    text: ['■「ドラゴエナジー」は同時に何枚でも使える。', '■【対抗】バトルしている《武装騎竜》１枚を選び、このバトル中、攻撃力＋3000、防御力＋3000し、さらに『反撃』を与える！（反撃：このカードが攻撃された後、このカードが場にいるなら、このカードの攻撃力以下の防御力を持つ攻撃してきたモンスター１枚を破壊する）'],
    can: () => battling().some(c => c.d.attr.includes('武装騎竜')),
    play: async p => {
      const c = await pick(p, '強化する《武装騎竜》を選ぶ', battling().filter(c => c.d.attr.includes('武装騎竜'))); if (!c) return;  // 相手の【対抗】で対象がいなくなることがある
      c.bm.pow = (c.bm.pow || 0) + 3000; c.bm.def = (c.bm.def || 0) + 3000; (c.bm.kw ||= []).push('反撃');
    }});
  def('TD01/0012', {name: 'ドラゴンシールド 緑竜の盾', type: 'spell', counter: true, attr: ['緑竜', '防御'], n: 4, local: 'greenDragonShield',
    text: ['■相手のターンの攻撃中、君のセンターにモンスターがいないなら使える。', '■【対抗】その攻撃を無効化し、君のライフを＋１する。'],
    can: p => G.battle && G.battle.def === p && !p.field.center,
    play: async p => { G.battle.nullified = true; heal(p, 1); }});
  def('TD01/0013', {name: '竜剣 ドラゴブレイブ', type: 'item', pow: 5000, crit: 3, attr: ['ドラゴン'], cost: {discard: 1, gauge: 1}, n: 3, local: 'dragonbladeDragobrave',
    text: ['■【装備コスト】手札１枚を捨て、ゲージ１を払う。']});
  def('TD01/0014', {name: '竜剣 ドラゴフィアレス', type: 'item', pow: 3000, crit: 2, attr: ['ドラゴン', '武器'], n: 3, local: 'dragonbladeDragofearless'});
  def('TD01/0015', {name: 'ガルガンチュア・パニッシャー!!', type: 'impact', attr: ['ドラゴン'], cost: {gauge: 4}, n: 3, local: 'gargantuaPunisher',
    text: ['■相手のライフが４以下で、君のセンターと相手のセンターにモンスターがいないなら使える。', '■【使用コスト】ゲージ４を払う。', '■相手にダメージ４！！このカードは無効化されず、このカードのダメージは減らない。'],
    can: p => foe(p).life <= 4 && !p.field.center && !foe(p).field.center,
    play: async p => await damage(foe(p), 4, true)});

  W = 'デンジャーワールド';
  def('TD02/0001', {name: 'アーマナイト・ブラックドレイク', type: 'monster', size: 3, pow: 9000, crit: 4, def: 8000, attr: ['アーマナイト'], cost: {gauge: 3}, n: 2, local: 'armorknightBlackDrake',
    text: ['■【コールコスト】ゲージ３を払う。']});
  def('TD02/0002', {name: 'アーマナイト・グリフィン', type: 'monster', size: 2, pow: 7000, crit: 3, def: 3000, attr: ['アーマナイト'], n: 4, local: 'armorknightGriffin'});
  def('TD02/0003', {name: 'アーマナイト・ケルベロス', type: 'monster', size: 2, pow: 5000, crit: 2, def: 5000, attr: ['アーマナイト'], kw: ['ソウルガード'], n: 4, local: 'armorknightCerberus',
    text: ['■【起動】君の場のサイズ１以下の《アーマナイト》１枚をこのカードのソウルに入れてよい。', '■【起動】“フルファイヤー”このカードのソウル１枚を捨ててよい。捨てたら、相手の場のモンスター１枚を破壊する！', '『ソウルガード』（このカードが場から離れる場合、ソウル１枚を捨てて場に残せる）'],
    acts: (p, c) => {
      // 相手の【対抗】で場が変わることがあるので、選べるカードは解決するときにもう一度数える
      const o = [], small = () => monsters(p).filter(x => x !== c && sizeOf(x) <= 1 && x.d.attr.includes('アーマナイト'));
      if (small().length) o.push({label: '【起動】サイズ１以下の《アーマナイト》をソウルに入れる', text: [c.d.text[0]], value: async () => {
        if (!small().length || !areaOf(c)) return;  // 【対抗】でこのカードが場を離れたら、ソウルに入れられない
        const x = await pick(p, 'ソウルに入れるモンスターを選ぶ', small(), true); if (!x) return;
        p.field[areaOf(x)] = null; p.drop.push(...x.soul.splice(0)); x.tm = {}; x.rest = false; c.soul.push(x);
        log(`${x.d.name} を ${c.d.name} のソウルに入れた`);
      }});
      if (c.soul.length && monsters(foe(p)).length) o.push({label: '【起動】フルファイヤー（ソウル１枚を捨てて相手モンスターを破壊）', text: [c.d.text[1]], value: async () => {
        if (!c.soul.length || !monsters(foe(p)).length) return;
        p.drop.push(c.soul.pop()); log('フルファイヤー！');
        await destroy(await pick(p, '破壊する相手のモンスターを選ぶ', monsters(foe(p))));
      }});
      return o;
    }});
  def('TD02/0004', {name: 'アーマナイト・ミノタウロス', type: 'monster', size: 2, pow: 5000, crit: 3, def: 5000, attr: ['アーマナイト'], n: 2, local: 'armorknightMinotaur'});
  def('TD02/0005', {name: 'アーマナイト・オーガー', type: 'monster', size: 1, pow: 5000, crit: 2, def: 3000, attr: ['アーマナイト'], n: 4, local: 'armorknightOgre'});
  def('TD02/0006', {name: 'アーマナイト・ヘルハウンド', type: 'monster', size: 1, pow: 5000, crit: 1, def: 6000, attr: ['アーマナイト'], n: 4, local: 'armorknightHellhound'});
  def('TD02/0007', {name: 'アーマナイト・ウィザード', type: 'monster', size: 1, pow: 3000, crit: 2, def: 5000, attr: ['アーマナイト'], n: 2, local: 'armorknightWizard'});
  def('TD02/0008', {name: 'アーマナイト・イーグル', type: 'monster', size: 0, pow: 4000, crit: 1, def: 1000, attr: ['アーマナイト'], n: 4, local: 'armorknightEagle'});
  def('TD02/0009', {name: '紅蓮斬撃', type: 'spell', attr: ['闘気'], cost: {gauge: 1}, n: 4, local: 'crimsonSlash',
    text: ['■【使用コスト】ゲージ１を払う。', '■君のセンターにモンスターがいないなら使える。', '■場のサイズ１かサイズ２の、モンスター１枚を破壊する！'],
    can: p => G.phase === 'main' && !p.field.center && allMonsters().some(c => sizeOf(c) === 1 || sizeOf(c) === 2),
    play: async p => destroy(await pick(p, '破壊するモンスターを選ぶ', allMonsters().filter(c => sizeOf(c) === 1 || sizeOf(c) === 2)))});
  def('TD02/0010', {name: '死中活路', type: 'spell', attr: ['闘気'], cost: {gauge: 1}, n: 3, local: 'survivalChance',
    text: ['■【使用コスト】ゲージ１を払う。', '■君のライフが５以下なら使える。', '■カード２枚を引く。「死中活路」は１ターンに１回だけ使える。'],
    can: p => G.phase === 'main' && p.life <= 5 && p.used.shichu !== G.turnNo,
    play: async p => { p.used.shichu = G.turnNo; draw(p, 2); }});
  def('TD02/0011', {name: '闘気四方陣', type: 'spell', counter: true, attr: ['闘気'], n: 4, local: 'battleAuraCircle',
    text: ['■相手のターンの攻撃中、君のセンターにモンスターがいないなら使える。', '■【対抗】その攻撃を無効化する。'],
    can: p => G.battle && G.battle.def === p && !p.field.center,
    play: async () => { G.battle.nullified = true; }});
  def('TD02/0012', {name: '血流呼気', type: 'spell', attr: ['闘気'], n: 3, local: 'invigoratingBreath',
    text: ['■君が《武器》を装備していて、君のセンターにモンスターがいないなら使える。', '■君のライフを＋４する。君のドロップゾーンの「血流呼気」１枚につき、回復する数値を１減らす。'],
    can: p => G.phase === 'main' && isWeapon(p.field.item) && !p.field.center,
    play: async p => heal(p, Math.max(0, 4 - p.drop.filter(c => c.id === 'TD02/0012').length))});
  def('TD02/0013', {name: '激槍 死狂い', type: 'item', pow: 5000, crit: 2, attr: ['闘気', '武器'], kw: ['貫通'], cost: {gauge: 2}, n: 4, local: 'hystericSpear',
    text: ['■【装備コスト】ゲージ２を払う。', '『貫通』（このカードの攻撃が相手センターのモンスターにヒットしたら、相手にも打撃力分ダメージを与える）']});
  def('TD02/0014', {name: '滅槍 岩抉り', type: 'item', pow: 3000, crit: 2, attr: ['闘気', '武器'], n: 3, local: 'boulderPiercingSpear'});
  def('TD02/0015', {name: '怒裏留バンカー!!', type: 'impact', attr: ['闘気'], cost: {gauge: 2}, n: 3, local: 'drillBunker',
    text: ['■【使用コスト】ゲージ２を払う。', '■君のセンターにモンスターがいないなら使える。', '■そのターン、君の場の《武器》１枚を、攻撃力＋4000、打撃力＋２し、『貫通』を与える。その《武器》が【スタンド】しているなら、その《武器》で攻撃する。'],
    can: p => !p.field.center && isWeapon(p.field.item),
    play: async p => {
      const w = p.field.item;
      w.tm.pow = (w.tm.pow || 0) + 4000; w.tm.crit = (w.tm.crit || 0) + 2; (w.tm.kw ||= []).push('貫通');
      if (!w.rest) await attack([w], await chooseTarget(p));
    }});

  // ===== 2014年 世界大会の優勝デッキ =====
  const TK = c => c.d.name.includes('迅雷騎士団');
  const RK = c => !!c && c.d.name.includes('煉獄騎士団');
  const isDK = c => !!c && c.d.attr.includes('竜騎士');
  const isNinja = c => !!c && c.d.attr.includes('忍者');
  const isNinpo = c => !!c && c.d.attr.includes('忍法');
  const isAdv = c => c.d.attr.includes('冒険者');
  const isEnemy = c => c.d.attr.includes('Dエネミー');
  const isDL = c => c.d.attr.includes('ドラゴンロード');
  const isWiz = c => c.d.attr.includes('魔術師');
  const isMission = c => c.d.name.includes('ミッションカード');
  const size3 = p => monsters(p).some(c => sizeOf(c) === 3);
  const foeAttacking = p => !!G.battle && G.battle.def === p;
  // 【対抗】で強化する系：バトル中の条件に合うカード1枚を、このバトル中だけ強くする
  const boost = (f, title, b) => ({
    can: () => battling().some(f),
    play: async p => {
      const c = await pick(p, title, battling().filter(f)); if (!c) return;  // 相手の【対抗】で対象がいなくなることがある
      c.bm.pow = (c.bm.pow || 0) + b.pow; c.bm.def = (c.bm.def || 0) + b.def;
      if (b.kw) (c.bm.kw ||= []).push(b.kw);
      if (b.heal) heal(p, b.heal);
    }});
  // 「次に破壊される時、場に残る」（このターン中）
  const stayOnce = (title, extra) => async p => {
    const c = await pick(p, title, monsters(p)); if (!c) return;
    c.tm.stay = {heal: extra.heal || 0};
    if (extra.kw) (c.tm.kw ||= []).push(extra.kw);
  };

  // 迅雷騎士団（ドラゴンワールド）
  W = 'ドラゴンワールド';
  def('BT04/0001', {name: '超武装騎竜 ガルガンチュアブレイド・ドラゴン', type: 'monster', size: 3, pow: 8000, crit: 3, def: 8000, attr: ['武装騎竜', '黒竜'], cost: {gauge: 3},
    text: ['■【コールコスト】ゲージ３を払う。', '■このカードが登場した時、君のドロップゾーンの《武器》２枚までを手札に加えてもよい。', '■【起動】“パニッシャーブレイド”君の手札の《武器》１枚を捨てる。捨てたら、場のカード１枚を破壊する。'],
    onEnter: p => fromDrop(p, isWeapon, '手札に加える《武器》を選ぶ（２枚まで）', 2),
    acts: (p, c) => p.hand.some(isWeapon) ? [{label: '【起動】パニッシャーブレイド（《武器》を捨てて場のカードを破壊）', value: async () => {
      const w = await pick(p, '捨てる《武器》を選ぶ', p.hand.filter(isWeapon), true); if (!w) return;
      remove(p.hand, w); p.drop.push(w);
      await destroy(await pick(p, '破壊するカードを選ぶ', allField()));
    }}] : []});
  def('BT03/0024', {name: '迅雷騎士団 ドラムバンカー・ドラゴン', type: 'monster', size: 2, pow: 5000, crit: 2, def: 4000, attr: ['武装騎竜', '赤竜'], kw: ['移動', '貫通', 'ソウルガード'], cost: {gauge: 1},
    text: ['■【コールコスト】ゲージ１を払い、君の手札のカード名に「迅雷騎士団」を含むカード１枚をこのカードのソウルに入れてよい。', '『移動』『貫通』『ソウルガード』'],
    onCall: async (p, c) => {
      const t = p.hand.filter(TK); if (!t.length) return;
      const x = await pick(p, 'ソウルに入れる「迅雷騎士団」を選ぶ', t, true);
      if (x) { remove(p.hand, x); c.soul.push(x); }
    }});
  def('BT03/0002', {name: '迅雷騎士団団長 コマンデュール・ファーネ', type: 'monster', size: 2, pow: 5000, crit: 2, def: 5000, attr: ['武装騎竜', '金竜'], cost: {gauge: 1},
    text: ['■【コールコスト】ゲージ１を払う。', '■君の場のカード名に「迅雷騎士団」を含むカード全てを、打撃力＋１し、さらに『移動』を与える。'],
    auraAll: (p, x) => TK(x) && {crit: 1, kw: ['移動']}});
  def('CP01/0004', {name: '迅雷騎士団 ハルバード・ドラゴン', type: 'monster', size: 2, pow: 6000, crit: 2, def: 6000, attr: ['武装騎竜', '赤竜'], kw: ['移動'], cost: {gauge: 1},
    text: ['■【コールコスト】ゲージ１を払う。', '『移動』（お互いのアタックフェイズ開始時に、場のこのカードを空いている別のエリアに置いてよい）']});
  def('BT03/0026', {name: '迅雷騎士団 ドラゴ・アーチャー', type: 'monster', size: 1, pow: 2000, crit: 2, def: 2000, attr: ['武装騎竜', '赤竜'],
    text: ['■このカードが登場した時、君の場にこのカード以外の、カード名に「迅雷騎士団」を含むカードがあるなら、カード１枚を引く。'],
    onEnter: (p, c) => { if (fieldCards(p).some(x => x !== c && TK(x))) draw(p, 1); }});
  def('BT03/0047', {name: 'タックソード・ドラゴン', type: 'monster', size: 1, pow: 5000, crit: 1, def: 2000, attr: ['武装騎竜', '青竜'], kw: ['貫通'], text: ['『貫通』（このカードの攻撃で相手センターのモンスターを破壊したら、相手にも打撃力分ダメージを与える）']});
  def('BT03/0080', {name: '迅雷騎士団 ブロードソード・ドラゴン', type: 'monster', size: 1, pow: 5000, crit: 2, def: 3000, attr: ['武装騎竜', '青竜'], noCenter: true,
    text: ['■このカードはセンターにコールできない。']});
  def('BT01/0024', {name: 'ドラゴンシールド 青竜の盾', type: 'spell', counter: true, attr: ['青竜', '防御'],
    text: ['■相手のターンの攻撃中、君のセンターにモンスターがいないなら使える。', '■【対抗】その攻撃を無効化し、君のデッキの上から１枚をゲージに置く。'],
    can: p => foeAttacking(p) && !p.field.center,
    play: async p => { G.battle.nullified = true; chargeTop(p, 1); }});
  def('BT01/0079', {name: 'ドラゴニック・シュート', type: 'spell', counter: true, attr: ['青竜'],
    text: ['■【対抗】場の攻撃力3000以下のモンスター１枚を破壊する。'],
    can: () => allMonsters().some(c => val(c, 'pow') <= 3000),
    play: async p => destroy(await pick(p, '破壊するモンスターを選ぶ', allMonsters().filter(c => val(c, 'pow') <= 3000)))});
  def('BT02/0079', {name: 'ドラゴ・ボンド', type: 'spell', counter: true, attr: ['金竜'],
    text: ['■君のセンターにモンスターがいないなら使える。', '■【対抗】君の場のモンスター１枚を選ぶ。そのターン中、次にそのモンスターが破壊される場合、君のライフを＋２し、そのモンスターを場に残せる。'],
    can: p => !p.field.center && monsters(p).length > 0,
    play: stayOnce('守るモンスターを選ぶ', {heal: 2})});
  def('CP01/0040', {name: 'ラス・オブ・ドラゴン', type: 'spell', counter: true, attr: ['金竜', '強化'],
    text: ['■【対抗】バトルしている《武装騎竜》１枚を選び、このバトル中、攻撃力＋6000、防御力＋6000する！'],
    ...boost(c => c.d.attr.includes('武装騎竜'), '強化する《武装騎竜》を選ぶ', {pow: 6000, def: 6000})});
  def('BT03/0027', {name: 'ドラゴン・バリアー', type: 'spell', counter: true, attr: ['ドラゴン', '防御'],
    text: ['■【対抗】そのターン中、次に君の場のサイズ２以上のモンスターが破壊される場合、そのモンスターを場に残せる。', '（アドバイス！“次に”と書いてあるけど、ようは破壊されそうになった時に、後から対抗で使えばいいんだ。あせらなくてもいいぞ！）'],
    play: async p => { p.barrier = G.turnNo; }});
  def('BT01/0011', {name: '鉄拳 ドラゴナックル', type: 'item', pow: 2000, crit: 2, attr: ['ドラゴン', '武器'], cost: {life: 1},
    text: ['■【装備コスト】ライフ１を払う。', '■“ヴォルカニックチャージ”このカードが相手にダメージを与えた時、君のデッキの上から１枚をゲージに置く。', '■【対抗】【起動】“ヴォルカニックバースト”ゲージ１を払ってよい。払ったら、そのターン中、このカードの攻撃力を＋2000する！'],
    onHit: async p => chargeTop(p, 1),
    fieldCounter: {label: 'ヴォルカニックバースト（ゲージ１で攻撃力＋2000）', can: (p, c) => p.gauge.length >= 1,
      pay: p => pay(p, {gauge: 1}), run: async (p, c) => { c.tm.pow = (c.tm.pow || 0) + 2000; log(`${c.d.name} のヴォルカニックバースト`); }}});
  // 効果は英語版のファンwiki（Sun Fist, Sunshine Impact）から訳した
  def('EB01/0001', {name: '太陽拳 サンシャイン・インパクト', type: 'item', pow: 6000, crit: 2, attr: ['武器'], cost: {gauge: 1},
    text: ['■【装備コスト】ゲージ１を払う。', '■このカードがバディモンスターと連携攻撃した時、そのターン中、このカードの攻撃力は∞になる。（∞は足しても減らしてもどの数値より大きい数値として扱う）'],
    onAttack: async (p, c, atk) => {
      if (!atk.some(x => x !== c && x.d.type === 'monster' && x.d.name === p.buddyName)) return;
      c.tm.pow = Infinity; log(`${c.d.name} の攻撃力は∞になった`);
    }});

  // 勇者ドラム（ダンジョンワールド）
  W = 'ダンジョンワールド';
  def('BT03/0017', {name: 'ブレイドウイング・フェニックス', type: 'monster', size: 2, pow: 5000, crit: 2, def: 1000, attr: ['Dエネミー', 'コンストラクト'], kw: ['2回攻撃'], cost: {gauge: 1},
    text: ['■【コールコスト】ゲージ１を払う。', '『２回攻撃』']});
  def('BT03/0036', {name: '勇者 ドラム', type: 'monster', size: 2, pow: 5000, crit: 3, def: 2000, attr: ['冒険者', '勇者'], kw: ['ソウルガード'], cost: {gauge: 1},
    text: ['■【コールコスト】ゲージ１を払い、君のデッキの上から１枚をこのカードのソウルに入れる。', '■“ポンコツドリル”このカードが、相手のセンターのモンスターに攻撃した時、相手とジャンケンする。君が勝ったら、そのターン中、このカードは『貫通』を得る。', '『ソウルガード』'],
    onCall: async (p, c) => { if (p.deck.length) c.soul.push(p.deck.shift()); },
    onAttack: async (p, c, atk, target) => {
      if (target === 'fighter' || areaOf(target) !== 'center') return;
      log('ポンコツドリル！ ジャンケン');
      if (await janken(p)) { (c.tm.kw ||= []).push('貫通'); log(`${c.d.name} に『貫通』`); }
    }});
  def('BT03/0037', {name: '魔法要塞 オーサー・クラインツ', type: 'monster', size: 2, pow: 4000, crit: 2, def: 5000, attr: ['冒険者'],
    text: ['■【起動】君のドロップゾーンの《冒険者》と《Dエネミー》１枚ずつを君のデッキの下に好きな順番で置いてよい。置いたら、君のデッキの上から１枚をゲージに置き、カード１枚を引く。この能力は１ターンに１回だけ使える。'],
    acts: (p, c) => p.used[c.id] !== G.turnNo && p.drop.some(isAdv) && p.drop.some(isEnemy) ? [{label: '【起動】ドロップの《冒険者》と《Dエネミー》をデッキの下へ', value: async () => {
      const a = await pick(p, 'デッキの下に置く《冒険者》を選ぶ', p.drop.filter(isAdv), true); if (!a) return;
      const e = await pick(p, 'デッキの下に置く《Dエネミー》を選ぶ', p.drop.filter(x => x !== a && isEnemy(x)), true); if (!e) return;
      p.used[c.id] = G.turnNo;
      remove(p.drop, a); remove(p.drop, e); p.deck.push(a, e);
      chargeTop(p, 1); draw(p, 1);
    }}] : []});
  def('TD04/0005', {name: 'ダックス コボルト', type: 'monster', size: 1, pow: 5000, crit: 2, def: 1000, attr: ['Dエネミー']});
  def('BT03/0008', {name: '竜剣のシーラ・ヴァンナー', type: 'monster', size: 1, pow: 2000, crit: 1, def: 2000, attr: ['冒険者', '戦士'],
    text: ['■君の場に《Dエネミー》があるなら、このカードの打撃力を＋２する。', '■君の場に他の《冒険者》があるなら、このカードは『貫通』を得る。'],
    // 「君の場に」はモンスターだけでなく、武器やセットも数える（グローリー・シーカーは武器でも《冒険者》）
    aura: (p, c) => ({crit: fieldCards(p).some(isEnemy) ? 2 : 0, kw: fieldCards(p).some(x => x !== c && isAdv(x)) ? ['貫通'] : []})});
  def('BT03/0018', {name: 'ダンシングマジシャン テツヤ', type: 'monster', size: 1, pow: 2000, crit: 1, def: 2000, attr: ['冒険者', '魔術師'],
    text: ['■“デフ、リリック！”このカードが他の《冒険者》と連携攻撃した時、連携攻撃したカード１枚を選び、そのターン中、『２回攻撃』を与える。この能力は１ターンに１回だけ使える。'],
    onAttack: async (p, c, atk) => {
      if (p.used[c.id] === G.turnNo || !atk.some(x => x !== c && isAdv(x))) return;
      p.used[c.id] = G.turnNo;
      const x = await pick(p, '“デフ、リリック！”『２回攻撃』を与えるカードを選ぶ', atk.filter(areaOf)); if (!x) return;
      (x.tm.kw ||= []).push('2回攻撃'); log(`${x.d.name} に『２回攻撃』`);
    }});
  def('TD04/0009', {name: '豆柴 コボルト', type: 'monster', size: 0, pow: 1000, crit: 2, def: 2000, attr: ['Dエネミー']});
  def('BT03/0100', {name: 'フェイト・スケルトン', type: 'monster', size: 0, pow: 3000, crit: 1, def: 3000, attr: ['Dエネミー', 'アンデッド']});
  def('TD04/0012', {name: 'ピラー・オブ・ファイヤー', type: 'spell', counter: true, attr: ['火力'], cost: {gauge: 1},
    text: ['■君のセンターにモンスターがいないなら使える。', '■【使用コスト】ゲージ１を払う。', '■【対抗】場の防御力6000以下のモンスター１枚を破壊する。'],
    can: p => !p.field.center && allMonsters().some(c => val(c, 'def') <= 6000),
    play: async p => destroy(await pick(p, '破壊するモンスターを選ぶ', allMonsters().filter(c => val(c, 'def') <= 6000)))});
  def('TD04/0015', {name: 'ミッションカード “パーティ結成！”', type: 'spell', set: true, attr: ['ドロー'],
    text: ['■『設置』（このカードは場に置いて使う）', '■君の場にこのカード以外の、カード名に「ミッション」を含むカードが『設置』された時、君のライフを＋１し、君のデッキから《冒険者》１枚を選び、手札に加え、デッキをシャッフルし、このカードをドロップゾーンに置く。'],
    onOtherSet: async (p, self, other) => {
      if (!isMission(other)) return;
      log('パーティ結成！ 達成'); heal(p, 1);
      await searchDeck(p, isAdv, '手札に加える《冒険者》を選ぶ');
      toDrop(self);
    }});
  def('TD04/0016', {name: 'ミッションカード “モンスター討伐！”', type: 'spell', set: true, attr: ['ドロー'], cost: {gauge: 1},
    text: ['『設置』（このカードは場に置いて使う）', '■【使用コスト】ゲージ１を払う。', '■君の《冒険者》の攻撃で、相手のモンスターを破壊した時、君のデッキの上から１枚を、裏向きでこのカードのソウルに入れる。', '■このカードのソウルが２枚以上になった時、このカードのソウル全てを手札に加え、このカードをドロップゾーンに置く。', '■「ミッションカード “モンスター討伐！”」は君の場に１枚だけ『設置』できる。'],
    can: (p, c) => !p.sets.some(x => x.id === c.id),
    onFoeKilled: async (p, self) => {
      if (!p.deck.length) return;
      self.soul.push(p.deck.shift()); log(`モンスター討伐！（${self.soul.length}/2）`);
      if (self.soul.length >= 2) { log('モンスター討伐！ 達成'); p.hand.push(...self.soul.splice(0)); toDrop(self); }
    }});
  def('BT03/0041', {name: 'コンティニュー！', type: 'spell', attr: ['冒険者', 'Dエネミー'], cost: {gauge: 1},
    text: ['■【使用コスト】ゲージ１を払う。', '■君のドロップのサイズ２以下の《冒険者》と《Dエネミー》１枚ずつを、【コールコスト】を払ってコールする。'],
    can: p => p.drop.some(x => x.d.type === 'monster' && sizeOf(x) <= 2 && (isAdv(x) || isEnemy(x))),
    play: async p => {
      for (const [f, t] of [[isAdv, '《冒険者》'], [isEnemy, '《Dエネミー》']]) {
        const x = await pick(p, `コールする${t}を選ぶ`, p.drop.filter(x => x.d.type === 'monster' && sizeOf(x) <= 2 && f(x) && canPay(p, x.d.cost)), true);
        if (x) await chooseArea(p, x, false, p.drop);
      }
    }});
  def('BT03/0042', {name: 'ミッションカード “ナザロの温泉宿で休め！”', type: 'spell', set: true, attr: ['回復'], cost: {gauge: 1},
    text: ['『設置』', '■【使用コスト】ゲージ１を払う。', '■君の《冒険者》が攻撃で破壊された時、君のドロップゾーンの《冒険者》２枚までを手札に加える。その後、このカードをドロップゾーンに置く。'],
    onOwnKilled: async (p, self) => {
      log('ナザロの温泉宿で休め！ 達成');
      await fromDrop(p, isAdv, '手札に加える《冒険者》を選ぶ（２枚まで）', 2);
      toDrop(self);
    }});
  def('BT03/0068', {name: 'シャルサーナの加護', type: 'spell', counter: true, attr: ['防御'], cost: {gauge: 1},
    text: ['■相手のターンの攻撃中に使える。', '■【使用コスト】ゲージ１を払う。', '■【対抗】その攻撃を無効化し、君のライフを＋１する。'],
    can: foeAttacking,
    play: async p => { G.battle.nullified = true; heal(p, 1); }});
  def('BT03/0020', {name: '勇者の装備 グローリー・シーカー', type: 'item', pow: 5000, crit: 3, attr: ['冒険者', '武器'], cost: {discard: 1}, revive: true,
    text: ['■【装備コスト】手札１枚を捨てる。', '■“奇跡の復活”君のライフが０になるなら、このカードをドロップゾーンに置き、君のデッキの上から１枚をドロップゾーンに置く。そのカードが魔法なら、君のライフは３になる！']});
  def('TD04/0019', {name: 'デッドエンド・クラッシュ！', type: 'impact', attr: ['冒険者'], cost: {gauge: 2},
    text: ['■【使用コスト】ゲージ２を払う。', '■相手のライフが３以下で、君の場に《冒険者》のモンスターがいて、君が《武器》を装備しているなら使える。', '■相手にダメージ３！！このカードは無効化されず、このカードのダメージは減らない。'],
    can: p => foe(p).life <= 3 && monsters(p).some(isAdv) && isWeapon(p.field.item),
    play: async p => await damage(foe(p), 3, true)});

  // デュエルズィーガー（エンシェントワールド）
  W = 'エンシェントワールド';
  def('EB01/0002', {name: 'デュエルズィーガー “テンペスト・エンフォーサー”', type: 'monster', size: 3, pow: 12000, crit: 3, def: 12000, attr: ['ドラゴンロード'], kw: ['貫通', '3回攻撃'], cost: {gauge: 3},
    evolveFrom: 'EB01/0012', lifelink: 'lose',
    text: ['■【コールコスト】君の場の「デュエルズィーガー“スパルタンド”」が破壊された時、「デュエルズィーガー“スパルタンド”」の『ライフリンク』を無効化し、ゲージ３を払う。', '『ライフリンク即死』（このモンスターが場から離れた時、君はゲームに敗北する。）『貫通』『３回攻撃』']});
  def('EB01/0012', {name: 'デュエルズィーガー “スパルタンド”', type: 'monster', size: 3, pow: 8000, crit: 3, def: 8000, attr: ['ドラゴンロード'], kw: ['2回攻撃', 'ソウルガード'], cost: {gauge: 3},
    evolveFrom: 'EB01/0013', evolveSoul: true, lifelink: 5,
    text: ['■【コールコスト】君の場の「武神竜王 デュエルズィーガー」が破壊された時、「武神竜王 デュエルズィーガー」の『ライフリンク』を無効化し、ゲージ３を払い、ドロップゾーンの「武神竜王 デュエルズィーガー」１枚をソウルに入れる。', '『２回攻撃』『ソウルガード』『ライフリンク５』']});
  def('EB01/0013', {name: '武神竜王 デュエルズィーガー', type: 'monster', size: 3, pow: 7000, crit: 2, def: 7000, attr: ['ドラゴンロード'], kw: ['2回攻撃', 'ソウルガード'], cost: {gauge: 3}, lifelink: 5,
    text: ['■【コールコスト】ゲージ３を払い、君の手札の《ドラゴンロード》２枚までをソウルに入れてよい。', '『２回攻撃』『ソウルガード』『ライフリンク５』'],
    onCall: async (p, c) => {
      for (let k = 0; k < 2; k++) {
        const x = await pick(p, `ソウルに入れる《竜王》を選ぶ（あと${2 - k}枚まで）`, p.hand.filter(isDL), true);
        if (!x) break;
        remove(p.hand, x); c.soul.push(x);
      }
    }});
  def('EB01/0022', {name: '嵐竜王 サンダートルネード', type: 'monster', size: 2, pow: 5000, crit: 2, def: 5000, attr: ['ドラゴンロード', '風'], lifelink: 1,
    text: ['■【起動】“魔風撃” 君の場にサイズ３のモンスターがいるなら、手札のこのカードを捨て、ゲージ１を払ってよい。そうしたら、場のアイテムか魔法１枚を破壊する。', '『ライフリンク１』'],
    handAct: {label: '【起動】魔風撃（捨ててアイテムか魔法を破壊）', can: p => size3(p) && p.gauge.length >= 1 && allField().some(x => x.d.type !== 'monster'),
      pay: async (p, c) => { remove(p.hand, c); p.drop.push(c); await pay(p, {gauge: 1}); },
      run: async p => { log('魔風撃！'); await destroy(await pick(p, '破壊するアイテムか魔法を選ぶ', allField().filter(x => x.d.type !== 'monster'))); }}});
  def('EB01/0038', {name: '氷竜王 グラキエス', type: 'monster', size: 2, pow: 3000, crit: 3, def: 4000, attr: ['ドラゴンロード', '水'], lifelink: 1,
    text: ['■【対抗】【起動】“氷結弾”相手のターンの攻撃中、君の場にサイズ３のモンスターがいるなら、手札のこのカードを捨て、ライフ１を払ってよい。そうしたら、その攻撃を無効化する。', '『ライフリンク１』'],
    handCounter: {label: '氷結弾（捨てて攻撃を無効化）', can: p => foeAttacking(p) && size3(p) && p.life > 1,
      pay: async (p, c) => { remove(p.hand, c); p.drop.push(c); payLife(p, 1); },
      run: async () => { if (G.battle) { G.battle.nullified = true; log('氷結弾！'); } }}});
  def('PR/0053', {name: '偽りの邪竜 デモニカ', type: 'monster', size: 2, pow: 5000, crit: 2, def: 4000, attr: ['ドラゴンロード'], lifelink: 1,
    text: ['■【対抗】【起動】相手が魔法を使った時、君の場にサイズ３のモンスターがいるなら、手札のこのカードを捨て、ゲージ２を払い、ライフ１を払ってよい。そうしたら、相手が使ったその魔法を無効化する。', '『ライフリンク１』'],
    handCounter: {label: '魔法を無効化（捨ててゲージ２とライフ１）', can: p => !!G.resp && G.resp.spell && G.resp.by === foe(p) && size3(p) && p.gauge.length >= 2 && p.life > 1,
      pay: async (p, c) => { remove(p.hand, c); p.drop.push(c); await pay(p, {gauge: 2}); payLife(p, 1); },
      run: async p => { G.resp.nullified = true; log(`${p.name}：デモニカで魔法を無効化`); }}});
  def('EB01/0005', {name: '幸いの竜 フォーボルカ', type: 'monster', size: 1, pow: 4000, crit: 0, def: 5000, attr: ['ドラゴンロード', '光'], lifelink: 1,
    text: ['■【起動】君の場にサイズ３のモンスターがいるなら、手札のこのカードを捨ててよい。捨てたら、君のデッキの上から２枚をゲージに置く。', '『ライフリンク１』'],
    handAct: {label: '【起動】捨ててデッキの上から２枚をゲージへ', can: size3,
      pay: async (p, c) => { remove(p.hand, c); p.drop.push(c); },
      run: async p => { chargeTop(p, 2); log(`${p.name}：フォーボルカでゲージ＋２`); }}});
  W = 'ジェネリック';
  def('BT01/0044', {name: 'バディヘルプ', type: 'spell', attr: ['水'], cost: {gauge: 3},
    text: ['■【使用コスト】ゲージ３を払う。', '■カード２枚を引く。'],
    play: async p => draw(p, 2)});
  W = 'エンシェントワールド';
  def('EB01/0007', {name: '天竜開闢', type: 'spell', attr: ['ドラゴン'], cost: {life: 2}, once: true,
    text: ['■【使用コスト】ライフ２を払う。', '■カード２枚を引く。「天竜開闢」は１ターンに１回だけ使える。'],
    play: async p => draw(p, 2)});
  def('EB01/0016', {name: '竜王伝', type: 'spell', attr: ['ドラゴン'], once: true,
    text: ['■君のデッキの上から１枚をゲージに置き、君のライフを＋１し、カード１枚を引く。「竜王伝」は１ターンに１回だけ使える。'],
    play: async p => { chargeTop(p, 1); heal(p, 1); draw(p, 1); }});
  def('EB01/0026', {name: '竜命励起', type: 'spell', counter: true, attr: ['ドラゴン'],
    text: ['■【対抗】バトルしている《ドラゴンロード》１枚を選び、このバトル中、攻撃力＋2000、防御力＋2000し、さらに君のライフを＋１する。'],
    ...boost(isDL, '強化する《竜王》を選ぶ', {pow: 2000, def: 2000, heal: 1})});
  def('EB01/0027', {name: '竜枯盛衰', type: 'spell', counter: true, attr: ['ドラゴン'], cost: {life: 2}, once: true,
    text: ['■【使用コスト】ライフ２を払う。', '■【対抗】君のデッキの上から４枚をゲージに置く。「竜枯盛衰」は１ターンに１回だけ使える。'],
    play: async p => chargeTop(p, 4)});
  def('EB01/0044', {name: '竜神無頼', type: 'spell', counter: true, attr: ['ドラゴン'],
    text: ['■【対抗】バトルしている《ドラゴンロード》１枚を選び、このバトル中、攻撃力＋3000、防御力＋3000し、さらに『反撃』を与える！(反撃：このカードが攻撃された後、このカードが場にいるなら、このカードの攻撃力以下の防御力を持つ攻撃してきたモンスター１枚を破壊する）'],
    ...boost(isDL, '強化する《竜王》を選ぶ', {pow: 3000, def: 3000, kw: '反撃'})});
  def('PR/0031', {name: '逆鱗', type: 'spell', counter: true, attr: ['ドラゴン'], cost: {life: 1, gauge: 1},
    text: ['■【使用コスト】ゲージ１を払い、ライフ１を払う。', '■【対抗】君の場のモンスター１枚を選ぶ。そのターン中、次にそのモンスターが破壊される場合、そのモンスターを場に残し、そのターン中、『反撃』を与える。'],
    can: p => monsters(p).length > 0,
    play: stayOnce('選ぶモンスター', {kw: '反撃'})});
  def('PR/0054', {name: '大器竜成', type: 'spell', attr: ['ドラゴン'], cost: {life: 2},
    text: ['■【使用コスト】ライフ２を払う。', '■君のデッキからサイズ３の《ドラゴンロード》１枚を手札に加え、君のデッキをシャッフルする。'],
    play: p => searchDeck(p, c => isDL(c) && c.d.size === 3, '手札に加えるサイズ３の《竜王》を選ぶ')});

  // メアリー・スー（マジックワールド）
  W = 'マジックワールド';
  def('BT03/0053', {name: 'ドラゴウィザード テンペスト・ウイング', type: 'monster', size: 3, pow: 7000, crit: 2, def: 6000, attr: ['魔術師'], kw: ['2回攻撃'], cost: {gauge: 2},
    text: ['■【コールコスト】ゲージ２を払う。', '■【起動】手札の《魔術師》１枚を捨ててよい。捨てたら、場のモンスター１枚をゲージに置く！', '『２回攻撃』'],
    acts: p => p.hand.some(isWiz) ? [{label: '【起動】《魔術師》を捨てて、場のモンスターをゲージへ', value: async () => {
      const w = await pick(p, '捨てる《魔術師》を選ぶ', p.hand.filter(isWiz), true); if (!w) return;
      remove(p.hand, w); p.drop.push(w);
      const t = await pick(p, 'ゲージに置くモンスターを選ぶ', allMonsters()); if (!t) return;
      await leave(t, () => { toZone(t, G.p[t.owner].gauge); log(`${t.d.name} をゲージに置いた`); });
    }}] : []});
  def('BT01/0005', {name: 'ハーブの魔術師 天竺 総一朗', type: 'monster', size: 2, pow: 4000, crit: 1, def: 5000, attr: ['魔術師'], costDown: true,
    text: ['■“精神集中”君の使う<マジックワールド>の魔法の【使用コスト】に書かれている払うゲージの数値は１少なくなる。']});
  // 効果は英語版のファンwiki（Center of the World, Mary Sue）から訳した。公式の日本語テキストはまだ確かめていない
  def('BT02/0002', {name: '世界の中心 メアリー・スー', type: 'monster', size: 2, pow: 4000, crit: 2, def: 3000, attr: ['魔術師'], cost: {gauge: 2},
    text: ['■【コールコスト】ゲージ２を払う。', '■“無敵の奇跡”このカードが登場した時、君のデッキから魔法１枚までを手札に加え、デッキをシャッフルする。'],
    onEnter: p => searchDeck(p, c => c.d.type === 'spell', '手札に加える魔法を選ぶ（１枚まで）', true)});
  def('BT01/0014', {name: 'ガラスの魔術師 ウィル・グラスアート', type: 'monster', size: 1, pow: 2000, crit: 2, def: 1000, attr: ['魔術師', '魔力'],
    text: ['■“ガラスの奇跡”このカードが相手にダメージを与えた時、ゲージ１を払ってよい。払ったら、カード１枚を引く。'],
    onHit: async p => {
      if (p.gauge.length && await ask(p, 'ガラスの奇跡：ゲージ１を払ってカード１枚を引きますか？', [{label: 'はい', value: true}, {label: 'いいえ', value: false}])) { await pay(p, {gauge: 1}); draw(p, 1); }
    }});
  def('BT02/0024', {name: '闇の魔法騎士 ドゥンケルハイト', type: 'monster', size: 1, pow: 4000, crit: 1, def: 3000, attr: ['魔術師', '騎士'],
    text: ['■“強固な盾”君の場に「光の魔法騎士 リヒト」がいるなら、このカードの攻撃力＋3000、防御力＋3000！'],
    aura: p => monsters(p).some(x => x.id === 'BT02/0025') && {pow: 3000, def: 3000}});
  def('BT02/0025', {name: '光の魔法騎士 リヒト', type: 'monster', size: 1, pow: 3000, crit: 1, def: 4000, attr: ['魔術師', '騎士'],
    text: ['■“閃光光線”君の場に「闇の魔法騎士 ドゥンケルハイト」がいるなら、このカードの攻撃力＋3000、防御力＋3000！'],
    aura: p => monsters(p).some(x => x.id === 'BT02/0024') && {pow: 3000, def: 3000}});
  def('BT03/0004', {name: 'ドラゴウィザード キヌース・アクシア', type: 'monster', size: 1, pow: 2000, crit: 2, def: 2000, attr: ['魔術師'], cost: {gauge: 1},
    text: ['■【コールコスト】ゲージ１を払う。', '■このカードが登場した時、君か相手を選び、ダメージ１！'],
    onEnter: async p => await damage(await ask(p, 'ダメージ１を与える相手', [{label: '相手', value: foe(p)}, {label: '自分', value: p}]), 1)});
  def('PR/0026', {name: 'ドラゴウィザード メディウム', type: 'monster', size: 1, pow: 1000, crit: 2, def: 3000, attr: ['魔術師'],
    text: ['■君の場に他の《魔術師》がいるなら、このカードの攻撃力を＋3000！'],
    aura: (p, c) => fieldCards(p).some(x => x !== c && isWiz(x)) && {pow: 3000}});
  def('BT01/0015', {name: 'マジカルグッバイ', type: 'spell', counter: true, attr: ['カウンター', '召喚'],
    text: ['■【対抗】場のサイズ２以下のモンスター１枚を、持ち主の手札に戻す。'],
    can: () => allMonsters().some(c => c.d.size <= 2),
    play: async p => {
      const t = await pick(p, '手札に戻すモンスターを選ぶ', allMonsters().filter(c => c.d.size <= 2)); if (!t) return;
      await leave(t, () => { toZone(t, G.p[t.owner].hand); log(`${t.d.name} を手札に戻した`); });
    }});
  def('BT01/0031', {name: 'ナイスワン！（最高だぜ）', type: 'spell', attr: ['魔力'], cost: {gauge: 1}, once: true,
    text: ['■【使用コスト】ゲージ１を払う。', '■カード２枚を引く。「ナイスワン！（最高だぜ）」は１ターンに１回だけ使える。'],
    play: async p => draw(p, 2)});
  def('BT02/0003', {name: '大魔法 マイ・グランファーザークロック', type: 'spell', attr: ['魔術師', '魔力'], cost: {gauge: 2},
    text: ['■【使用コスト】ゲージ２を払う。', '■君のドロップゾーンの《魔術師》が６種類以上あるなら使える。', '■君のドロップゾーンのカード全てをデッキに戻し、デッキをシャッフルする。このターンが終わった後、もう１度君のターンになる！'],
    can: p => new Set(p.drop.filter(isWiz).map(c => c.d.name)).size >= 6,
    play: async p => { p.deck.push(...p.drop.splice(0)); shuffle(p.deck); G.extraTurn = p.i; log('このターンの後、もう一度ターンを行う！'); }});
  def('BT02/0026', {name: 'コーシャー', type: 'spell', attr: ['魔力'], once: true,
    text: ['■君の場に《魔術師》のモンスターが２枚以上いるなら使える。', '■君のデッキの上から１枚をゲージに置き、カード１枚を引く。「コーシャー」は１ターンに１回だけ使える。'],
    can: p => monsters(p).filter(isWiz).length >= 2,
    play: async p => { chargeTop(p, 1); draw(p, 1); }});
  def('BT02/0027', {name: 'ソロモンの鍵 上巻', type: 'spell', counter: true, attr: ['魔力'],
    text: ['■【対抗】君のデッキの上から２枚をゲージに置く。'],
    play: async p => chargeTop(p, 2)});
  def('BT02/0028', {name: 'ソロモンの鍵 下巻', type: 'spell', attr: ['魔力'],
    text: ['■君のライフを＋１する。君のドロップゾーンに「ソロモンの鍵 上巻」があるなら、カード１枚を引く。'],
    play: async p => { heal(p, 1); if (p.drop.some(c => c.id === 'BT02/0027')) draw(p, 1); }});
  def('BT02/0054', {name: 'チェレックス！', type: 'spell', counter: true, attr: ['防御'], cost: {gauge: 1},
    text: ['■【使用コスト】ゲージ１を払う。', '■【対抗】そのターン中、次に君に与えられるダメージを０に減らし、君のライフを＋１する！'],
    play: async p => { p.chillax = G.turnNo; }});
  def('BT03/0032', {name: 'パワーレイ・マキシマム', type: 'spell', attr: ['魔力', '火力'], cost: {gauge: 2},
    text: ['■【使用コスト】ゲージ２を払う。', '■相手の場の防御力6000以下のモンスター全てを破壊する。'],
    can: p => monsters(foe(p)).some(c => val(c, 'def') <= 6000),
    play: async p => { for (const c of monsters(foe(p)).filter(c => val(c, 'def') <= 6000)) await destroy(c); }});
  def('BT01/0034', {name: 'ガンロッド ベヒシュタイン', type: 'item', pow: 3000, crit: 1, attr: ['武器'], cost: {gauge: 1},
    text: ['■【装備コスト】ゲージ１を払う。', '■【起動】このカードを【レスト】してよい。【レスト】したら、相手にダメージ１。'],
    acts: (p, c) => c.rest ? [] : [{label: '【起動】レストして相手にダメージ１', value: async () => { if (!areaOf(c)) return; c.rest = true; await damage(foe(p), 1); }}]});  // 場を離れたらレストできない

  // 煉獄騎士（ダークネスドラゴンワールド）
  W = 'ダークネスドラゴンワールド';
  const rkSmall = p => monsters(p).filter(RK);
  def('BT05/0046', {name: '煉獄騎士団団長 ディミオスソード・ドラゴン', type: 'monster', size: 2, pow: 6000, crit: 2, def: 1000, attr: ['武装騎竜', '白竜'],
    text: ['■【対抗】【起動】君のターン中、君の場のこのカード以外のカード名に「煉獄騎士団」を含むモンスター１枚を破壊する。破壊したら、このカードをスタンドする。'],
    actInAttack: true, counterAct: true,
    acts: (p, c) => monsters(p).some(x => x !== c && RK(x)) ? [{label: '【起動】煉獄騎士団を破壊してスタンド', value: async () => {
      const t = await pick(p, '破壊する「煉獄騎士団」を選ぶ', monsters(p).filter(x => x !== c && RK(x)));
      if (!t) return;
      const broke = await destroy(t);
      if (broke && areaOf(c)) { c.rest = false; log(`${c.d.name} はスタンドした`); }
    }}] : []});
  def('BT05/0010', {name: '煉獄騎士団 ガイラムランス・ドラゴン', type: 'monster', size: 2, pow: 6000, crit: 2, def: 2000, attr: ['武装騎竜', '闇竜'],
    sizeDown: p => (p.buddyName || '').includes('煉獄騎士団') ? 1 : 0,
    text: ['■君のバディモンスターがカード名に「煉獄騎士団」を含むカードなら、このカードのサイズを１減らす！！！', '■【対抗】【起動】君のターン中、君の場のこのカード以外のカード名に「煉獄騎士団」を含むモンスター１枚を破壊する。破壊したら、そのターン中、このカードの打撃力を＋１！この能力は１ターンに１回だけ使える。'],
    actInAttack: true, counterAct: true,
    acts: (p, c) => p.used[c.id] !== G.turnNo && monsters(p).some(x => x !== c && RK(x)) ? [{label: '【起動】煉獄騎士団を破壊して打撃力＋１', value: async () => {
      const t = await pick(p, '破壊する「煉獄騎士団」を選ぶ', monsters(p).filter(x => x !== c && RK(x)));
      if (!t) return;
      const broke = await destroy(t);
      if (broke && areaOf(c)) { p.used[c.id] = G.turnNo; c.tm.crit = (c.tm.crit || 0) + 1; log(`${c.d.name} の打撃力＋１`); }
    }}] : []});
  def('BT05/0024', {name: '煉獄騎士団 クロスボウ・ドラゴン', type: 'monster', size: 0, pow: 2000, crit: 1, def: 2000, attr: ['武装騎竜', '闇竜'],
    text: ['■君の場にカード名に「煉獄騎士団」を含むカードがあるなら、コールできる。', '■このカードが相手にダメージを与えた時、君のデッキの上から１枚をゲージに置く。'],
    callCan: p => fieldCards(p).some(RK),
    onHit: async p => chargeTop(p, 1)});
  def('PP01/0039', {name: '煉獄騎士団 エヴィルグレイブ・ドラゴン', type: 'monster', size: 1, pow: 3000, crit: 1, def: 3000, attr: ['武装騎竜', '闇竜'],
    text: ['■アタックフェイズ中、このカードがモンスターの効果で破壊された時、カード１枚を引く。'],
    onDestroyed: async p => { draw(p, 1); log(`${p.name}：エヴィルグレイブでカードを１枚引いた`); }});
  def('BT05/0118', {name: '煉獄騎士団 シルバースタッフ・ドラゴン', type: 'monster', size: 1, pow: 5000, crit: 1, def: 4000, attr: ['武装騎竜', '闇竜']});
  def('BT05/0121', {name: '煉獄騎士団 アイアンゲルド・ドラゴン', type: 'monster', size: 1, pow: 4000, crit: 2, def: 2000, attr: ['武装騎竜', '闇竜']});
  def('BT05/0023', {name: '煉獄騎士団 ソードブレイカー・ドラゴン', type: 'monster', size: 1, pow: 3000, crit: 1, def: 1000, attr: ['武装騎竜', '闇竜'],
    text: ['■このカードが相手にダメージを与えた時、君のライフが６以下なら、相手の場のアイテム１枚を破壊する。'],
    onHit: async p => { if (p.life <= 6 && foe(p).field.item) await destroy(foe(p).field.item); }});
  def('BT05/0049', {name: '煉獄騎士団 ナックルダスター・ドラゴン', type: 'monster', size: 0, pow: 2000, crit: 2, def: 1000, attr: ['武装騎竜', '闇竜'],
    text: ['■君の場にカード名に「煉獄騎士団」を含むカードがあるなら、コールできる。'],
    callCan: p => fieldCards(p).some(RK)});
  def('BT04/0042', {name: 'アビス・シンフォニア', type: 'spell', attr: ['闇竜'], cost: {gauge: 1}, once: true,
    text: ['■君のライフが６以下なら使える。', '■【使用コスト】ゲージ１を払う。', '■カード２枚を引く。「アビス・シンフォニア」は１ターンに１回だけ使える。'],
    can: p => p.life <= 6,
    play: async p => draw(p, 2)});
  def('BT05/0025', {name: '煉獄騎士よ、永遠なれ', type: 'spell', attr: ['闇竜'], cost: {gauge: 1, damage: 1},
    text: ['■【使用コスト】ゲージ１を払い、君にダメージ１。', '■君のドロップゾーンのカード名に「煉獄騎士団」を含むモンスター２枚までを手札に加える。'],
    play: async p => fromDrop(p, c => c.d.type === 'monster' && RK(c), '手札に加える「煉獄騎士団」を選ぶ（２枚まで）', 2)});
  def('BT04/0101', {name: 'ドラゴンシールド 黒竜の盾', type: 'spell', counter: true, attr: ['闇竜', '防御'], shieldDamage: true,
    text: ['■君がダメージを受ける時、君のセンターにモンスターがいないなら使える。', '■【対抗】そのダメージを０に減らし、君のライフを＋１する。'],
    can: p => G.turn !== p.i && !p.field.center,
    play: async p => { p.damageShield = true; log(`${p.name}：黒竜の盾`); }});
  def('TD06/0015', {name: 'ミッドナイト・シャドウ', type: 'spell', counter: true, attr: ['闇竜', '防御'],
    text: ['■相手のターンの攻撃中に使える。', '■【対抗】その攻撃が連携攻撃でないなら、無効化する。'],
    can: p => foeAttacking(p) && G.battle.atk.length === 1,
    play: async p => { if (G.battle) { G.battle.nullified = true; log(`ミッドナイト・シャドウ！`); } }});
  def('BT04/0041', {name: 'デスグリップ', type: 'spell', counter: true, attr: ['闇竜'], cost: {gauge: 1},
    text: ['■【使用コスト】ゲージ１を払う。', '■【対抗】場のサイズ２以下のモンスター１枚を破壊する！！'],
    can: () => allMonsters().some(c => sizeOf(c) <= 2),
    play: async p => destroy(await pick(p, '破壊するモンスターを選ぶ', allMonsters().filter(c => sizeOf(c) <= 2)))});
  // 地獄の炎も、生ぬるいは「相手のターン中、君がダメージを受けた時に使える」。その一瞬だけ can を通す（damage() が立てる）
  let damageTiming = null;
  def('BT05/0082', {name: '地獄の炎も、生ぬるい', type: 'spell', counter: true, attr: ['闇竜'], dmgTiming: true,
    text: ['■相手のターン中、君がダメージを受けた時に使える。', '■【対抗】カード１枚を引く。君の場にカード名に「煉獄騎士団」を含むモンスターがいるなら、さらにカード１枚を引く。'],
    can: p => damageTiming === p,
    play: async p => { draw(p, 1); if (monsters(p).some(RK)) draw(p, 1); }});
  def('BT05/0076', {name: '煉獄の炎をその身に宿し', type: 'spell', counter: true, attr: ['闇竜'], cost: {gauge: 2},
    text: ['■相手のターンの攻撃中に使える。', '■【使用コスト】ゲージ２を払う。', '■【対抗】君の場のカード名に「煉獄騎士団」を含むモンスター１枚を破壊する。破壊したら、その攻撃を無効化し、その破壊したカードの打撃力の数値分、相手にダメージ！！'],
    can: p => foeAttacking(p) && monsters(p).some(RK),
    play: async p => {
      const t = await pick(p, '破壊する「煉獄騎士団」を選ぶ', monsters(p).filter(RK)); if (!t) return;
      const crit = val(t, 'crit');
      const broke = await destroy(t);
      if (!broke) return;
      if (G.battle) G.battle.nullified = true;
      await damage(foe(p), crit);
    }});
  def('BT05/0052', {name: 'その身を砕き、我を支えよ', type: 'spell', set: true, attr: ['闇竜'], reviveSet: true,
    text: ['■『設置』（このカードは場に置いて使う）', '■君の場のカード名に「煉獄騎士団」を含むモンスターが効果で破壊された時、君のデッキの上から１枚をゲージに置く。', '■君のライフが０になるなら、このカードをドロップゾーンに置き、君のデッキの上から１枚をドロップゾーンに置く。そのカードが魔法なら、君のライフは２になる！', '■「その身を砕き、我を支えよ」は君の場に１枚だけ『設置』できる。'],
    can: p => !p.sets.some(x => x.id === 'BT05/0052'),
    onTKDestroyed: (p, s, c) => { chargeTop(p, 1); log(`${s.d.name}：${c.d.name} が効果で破壊されたのでゲージ＋１`); }});
  def('BT05/0085', {name: '煉獄剣 フェイタル', type: 'item', pow: 4000, crit: 2, attr: ['闇竜', '武器'], cost: {gauge: 1},
    text: ['■【装備コスト】ゲージ１を払う。', '■君の場のモンスターが破壊された時、そのターン中、このカードを打撃力＋１する。この能力は１ターンに１回だけ発動する。'],
    onMonsterDestroyed: (p, it) => { it.tm.crit = (it.tm.crit || 0) + 1; log(`${it.d.name}：打撃力＋１（このターン）`); }});
  def('BT05/0053', {name: 'ディストーション・パニッシャー!!', type: 'impact', counter: true, attr: ['闇竜'], cost: {gauge: 4},
    text: ['■【使用コスト】ゲージ４を払う。', '■相手のライフが４以下で、君のセンターと相手のセンターにモンスターがいないなら次の２つから１つを選んで使う。', '・相手にダメージ４！！', '・【対抗】“カウンターファイナル！！”相手のファイナルフェイズ中に、相手が必殺技を使った時に使える。相手にダメージ４！！'],
    can: p => (G.turn === p.i && G.phase === 'final' && foe(p).life <= 4 && !p.field.center && !foe(p).field.center)
      || (G.turn !== p.i && G.phase === 'final' && G.resp && G.resp.impact),
    play: async p => await damage(foe(p), 4)});

  // 爆竜牙（ドラゴンワールド）
  W = 'ドラゴンワールド';
  const isDrum = c => !!c && c.d.type === 'monster' && c.d.name.includes('ドラム');
  // SDドラムの【起動】で払う分（ゲージ１＋重ねるカードの【コールコスト】）。まとめて払わないと、合計が足りなくてもコールできてしまう
  const sdCost = t => { const ec = t.d.cost || {}; return {gauge: 1 + (ec.gauge || 0), discard: ec.discard, life: ec.life, damage: ec.damage}; };
  def('BT01/0021', {name: 'ドラムバンカー・ドラゴン', type: 'monster', size: 2, pow: 5000, crit: 3, def: 5000, attr: ['武装騎竜', '赤竜'], kw: ['ソウルガード'], cost: {gauge: 1},
    text: ['■【コールコスト】ゲージ１を払い、君のデッキの上から１枚をこのカードのソウルに入れる。', '『ソウルガード』（このカードが場から離れる場合、ソウル１枚を捨てて場に残せる）'],
    onCall: async (p, c) => { if (p.deck.length) c.soul.push(p.deck.shift()); }});
  def('BT05/0002', {name: '超武装騎竜 ドラムブレイカー・ドラゴン', type: 'monster', size: 2, pow: 7000, crit: 3, def: 5000, attr: ['武装騎竜', '赤竜'], kw: ['移動', '貫通', 'ソウルガード'], cost: {gauge: 1}, stackOn: 'ドラム',
    text: ['■【コールコスト】ゲージ１を払い、このカードを君の場のカード名に「ドラム」を含むモンスターの上に重ねる。', '■【起動】このカードを君の場の空いているエリアに置く。この能力は１ターンに１回だけ使える。', '『移動』『貫通』『ソウルガード』'],
    acts: (p, c) => p.used[c.id] !== G.turnNo && AREAS.some(a => !p.field[a]) ? [{label: '【起動】空いているエリアへ置く', value: async () => {
      const free = AREAS.filter(a => !p.field[a]);
      const a = await ask(p, '置くエリアを選ぶ', free.map(x => ({label: AN[x], value: x})));
      if (!a) return;
      const from = areaOf(c); if (!from) return;
      p.field[from] = null; p.field[a] = c; p.used[c.id] = G.turnNo;
      log(`${p.name}：${c.d.name} を${AN[a]}へ置いた`);
    }}] : []});
  def('SS01/0004', {name: 'ファングスレイド・ドラム', type: 'monster', size: 2, pow: 5000, crit: 2, def: 5000, attr: ['武装騎竜', '赤竜'], kw: ['移動'],
    text: ['『移動』（お互いのアタックフェイズ開始時に、場のこのカードを空いている別のエリアに置いてよい）']});
  def('PR/0129', {name: 'SDドラム', type: 'monster', size: 1, pow: 2000, crit: 1, def: 2000, attr: ['武装騎竜', '赤竜'],
    text: ['■【起動】ゲージ１を払う。払ったら、君のドロップゾーンのカード名に「ドラム」を含むモンスター１枚を、【コールコスト】を払って、このモンスターの上に重ねてコールする。'],
    acts: (p, c) => p.drop.some(t => isDrum(t) && canPay(p, sdCost(t))) ? [{label: '【起動】ドロップの「ドラム」を重ねてコール', value: async () => {
      const t = await pick(p, '重ねてコールする「ドラム」を選ぶ', p.drop.filter(x => isDrum(x) && canPay(p, sdCost(x)))); if (!t) return;
      if (!canPay(p, sdCost(t))) { log('コストが足りない'); return; }
      const area = areaOf(c); if (!area) return;
      await pay(p, sdCost(t));
      remove(p.drop, t); t.soul.push(c, ...c.soul.splice(0)); p.field[area] = t;
      log(`${p.name}：${c.d.name} の上に ${t.d.name} を重ねてコール`);
      while (monsters(p).reduce((s, x) => s + sizeOf(x), 0) > 3) {
        const x = await pick(p, 'サイズ合計が3を超えた。ドロップに置くモンスターを選ぶ', monsters(p).filter(x => x !== t));
        if (!x) break;
        toDrop(x); log(`${x.d.name} をドロップへ（サイズ超過）`);
      }
      if (t.d.onCall) await t.d.onCall(p, t);
      if (t.d.onEnter) await trigger(p, t, () => t.d.onEnter(p, t), abilityText(t, /登場した時/));
    }}] : []});
  def('EB01/0019', {name: 'アイアンチェーン・ドラゴン', type: 'monster', size: 1, pow: 3000, crit: 1, def: 3000, attr: ['武装騎竜', '雷竜'],
    text: ['■【起動】“リスティックチェーン！” ゲージ１を払ってよい。払ったら、そのターン中、場のカード１枚の防御力を、－3000する！'],
    acts: (p, c) => p.gauge.length >= 1 && allField().length ? [{label: '【起動】場のカードの防御力を−3000', value: async () => {
      const t = await pick(p, '防御力を−3000するカードを選ぶ', allField()); if (!t) return;
      await pay(p, {gauge: 1});
      t.tm.def = (t.tm.def || 0) - 3000; log(`${t.d.name} の防御力−3000`);
    }}] : []});
  def('SS01/0008', {name: 'ブーメラン・ドラゴン', type: 'monster', size: 0, pow: 2000, crit: 1, def: 2000, attr: ['武装騎竜', '赤竜'], bounce: true,
    text: ['■このカードのバトル終了時、このカードを君の手札に戻す！']});
  def('BT05/0029', {name: 'ミサイルバンカー・ドラゴン', type: 'monster', size: 0, pow: 4000, crit: 1, def: 1000, attr: ['武装騎竜', '赤竜'], kw: ['貫通'], battleEnd: true,
    text: ['■“ミサイル発射！”このカードのバトル終了時、このカードを君のデッキの下に置き、君のデッキの上から１枚をゲージに置く。', '『貫通』']});
  def('BT03/0088', {name: 'ドラゴジーニアス', type: 'spell', attr: ['ドラゴン'], cost: {gauge: 2}, once: true,
    text: ['■【使用コスト】ゲージ２を払う。', '■君のライフが５以下なら使える。', '■カード２枚を引く。「ドラゴジーニアス」は１ターンに１回だけ使える。'],
    can: p => p.life <= 5,
    play: async p => draw(p, 2)});
  def('H-BT01/0003', {name: '究極未来竜 ドラム・ザ・フューチャー', type: 'monster', size: 2, pow: 11000, crit: 3, def: 4000, attr: ['武装騎竜', '赤竜'], cost: {gauge: 2},
    text: ['■【コールコスト】ゲージ２を払う。', '■【対抗】【起動】君のライフが５以下で、このカードが君と連携攻撃しているなら、ゲージ１を払い、手札１枚を捨ててよい。そうしたら、この攻撃は無効化されず、そのダメージは減らない。'],
    fieldCounter: {label: '攻撃を無効化されず、ダメージも減らさない', can: (p, c) => G.battle && G.battle.att === p && G.battle.atk.includes(c) && G.battle.atk.length >= 2 && p.life <= 5 && p.gauge.length >= 1 && p.hand.filter(x => x !== c).length >= 1,
      pay: p => pay(p, {gauge: 1, discard: 1}),
      run: async (p, c) => { if (G.battle) { G.battle.nullified = false; G.battle.unreduce = true; } log(`${c.d.name}：この攻撃は無効化されず、ダメージも減らない`); }}});

  // 月影大盾（カタナワールド）
  W = 'カタナワールド';
  def('PR/0063', {name: '月影 大盾', type: 'monster', size: 3, pow: 5000, crit: 2, def: 9000, attr: ['忍者'], kw: ['2回攻撃'], cost: {gauge: 2},
    text: ['■【コールコスト】ゲージ２を払う。', '■このカードが連携攻撃された時、ゲージ２を払ってよい。払ったら、その攻撃を無効化する。', '『２回攻撃』'],
    fieldCounter: {label: '連携攻撃を無効化（ゲージ２）', can: (p, c) => !!G.battle && G.battle.def === p && G.battle.target === c && G.battle.atk.length >= 2 && p.gauge.length >= 2,
      pay: p => pay(p, {gauge: 2}), run: async () => { if (G.battle) { G.battle.nullified = true; log('月影 大盾：連携攻撃を無効化'); } }}});
  def('BT02/0017', {name: '電子忍者 紫電', type: 'monster', size: 1, pow: 3000, crit: 1, def: 1000, attr: ['忍者'],
    text: ['■【起動】“サイバー・アナライズ”手札の《忍法》１枚を捨て、ゲージ１を払ってよい。そうしたら、カード２枚を引く。この能力は１ターンに１回だけ使える。'],
    acts: (p, c) => p.used[c.id] !== G.turnNo && p.gauge.length >= 1 && p.hand.some(isNinpo) ? [{label: '【起動】忍法を捨てて２枚引く', value: async () => {
      const h = await pick(p, '捨てる《忍法》を選ぶ', p.hand.filter(isNinpo)); if (!h) return;
      await pay(p, {gauge: 1}); remove(p.hand, h); p.drop.push(h); p.used[c.id] = G.turnNo; draw(p, 2);
    }}] : []});
  def('PR/0178', {name: '月影 天狼もうど', type: 'monster', size: 0, pow: 2000, crit: 1, def: 1000, attr: ['忍者'], kw: ['移動'],
    text: ['『移動』']});
  def('BT02/0038', {name: '忍び巻物', type: 'spell', set: true, attr: ['忍法'], soulUse: '忍法',
    text: ['■『設置』（このカードは場に置いて使う）', '■【起動】ゲージ１を払い、君の手札１枚を裏向きでこのカードのソウルに入れてよい。そうしたら、カード１枚を引く。この能力は１ターンに１回だけ使える。', '■君はこのカードのソウルを見て、そのソウルから《忍法》を【使用コスト】を払って使える。'],
    acts: (p, c) => p.used[c.id] !== G.turnNo && p.gauge.length >= 1 && p.hand.length ? [{label: '【起動】手札をソウルに入れて１枚引く', value: async () => {
      const h = await pick(p, 'ソウルに入れる手札を選ぶ', p.hand); if (!h) return;
      await pay(p, {gauge: 1}); remove(p.hand, h); c.soul.push(h); p.used[c.id] = G.turnNo; draw(p, 1);
    }}] : []});
  def('BT02/0037', {name: '明鏡止水', type: 'spell', counter: true, attr: ['忍法'], once: true,
    text: ['■【対抗】君のデッキの上から３枚をゲージに置く。「明鏡止水」は１ターンに１回だけ使える。'],
    play: async p => chargeTop(p, 3)});
  def('BT02/0018', {name: '爆殺奈落送りの術', type: 'spell', set: true, attr: ['忍法'], cost: {gauge: 1},
    text: ['■『設置』', '■【使用コスト】ゲージ１を払い、君のデッキの中から１枚を選び、裏向きでこのカードのソウルに入れ、君のデッキをシャッフルする。', '■相手の場にモンスターが登場した時、このカードのソウル全てをドロップゾーンに置いてよい。置いたら、そのカードの中に、登場したモンスターのサイズと同じサイズのカードがあるなら、そのモンスターを破壊し、相手にダメージ２。その後、このカードをドロップゾーンに置く。'],
    play: async (p, c) => {
      if (!p.deck.length) return;
      const x = await pick(p, 'ソウルに入れるカードをデッキから選ぶ', uniqueCards(p.deck));
      if (!x) return;
      remove(p.deck, x); c.soul.push(x); shuffle(p.deck);
      log(`${p.name}：奈落送りの術のソウルを１枚入れた`);
    },
    onFoeEnter: async (p, self, m) => {
      // 同じサイズのカードがソウルにないと何も起きないので、その時は聞かない
      const hit = self.soul.some(x => x.d.type === 'monster' && x.d.size === sizeOf(m));
      if (!hit) return;
      // サイズが合うモンスターが登場した時だけ、使うかどうかを決める
      const use = await ask(p, `${self.d.name}のソウルを全てドロップに置いて使う？（${m.d.name} サイズ${sizeOf(m)}）`,
        [{label: '使う', value: true}, {label: '使わない', value: false}], false, self);
      if (!use) return;
      const souls = self.soul.splice(0); p.drop.push(...souls);
      if (areaOf(m) && souls.some(x => x.d.type === 'monster' && x.d.size === sizeOf(m))) { await destroy(m); await damage(foe(p), 2); }
      toDrop(self);
    }});
  def('BT02/0098', {name: '鬼道 呪い氷鏡', type: 'spell', counter: true, attr: ['忍法'], cost: {gauge: 1},
    text: ['■【使用コスト】ゲージ１を払う。', '■相手のモンスターが君のセンターのモンスターを攻撃した時に使える。', '■【対抗】その攻撃が連携攻撃でないなら、無効化する。無効化したら、サイズ２以下の攻撃してきたモンスター１枚を破壊する。'],
    can: p => foeAttacking(p) && G.battle.target && G.battle.target !== 'fighter' && areaOf(G.battle.target) === 'center' && G.battle.atk.length === 1,
    play: async p => { const a = G.battle.atk[0]; G.battle.nullified = true; if (areaOf(a) && sizeOf(a) <= 2) await destroy(a); }});
  def('BT02/0063', {name: 'うつせみの術', type: 'spell', counter: true, attr: ['忍法'],
    text: ['■相手のターンの攻撃中に使える。', '■【対抗】その攻撃が連携攻撃でないなら、無効化する。'],
    can: p => foeAttacking(p) && G.battle.atk.length === 1,
    play: async () => { if (G.battle) G.battle.nullified = true; }});
  def('BT03/0059', {name: '忍法 蛇睨み', type: 'spell', counter: true, attr: ['忍法'], cost: {life: 1},
    text: ['■【使用コスト】ライフ１を払う。', '■【対抗】相手の場のモンスター１体を【レスト】にする。'],
    can: p => monsters(foe(p)).some(c => !c.rest),
    play: async p => { const t = await pick(p, 'レストにする相手のモンスターを選ぶ', monsters(foe(p)).filter(c => !c.rest)); if (t) { t.rest = true; log(`${t.d.name} をレストにした`); } }});
  def('BT02/0064', {name: '忍法 玉鋼', type: 'spell', counter: true, attr: ['忍法'],
    text: ['■【対抗】バトルしている《忍者》１枚を選び、このバトル中、攻撃力＋3000、防御力＋3000し、『反撃』を与える！'],
    ...boost(isNinja, '強化する《忍者》を選ぶ', {pow: 3000, def: 3000, kw: '反撃'})});
  def('EB01/0033', {name: '真剣白刃取り', type: 'spell', counter: true, attr: ['忍法', '体術'],
    text: ['■相手が《武器》で君のモンスターを攻撃している攻撃中に使える。', '■【対抗】その攻撃を無効化し、カード１枚を引く。'],
    can: p => foeAttacking(p) && G.battle.target !== 'fighter' && G.battle.atk.some(isWeapon),
    play: async p => { G.battle.nullified = true; draw(p, 1); }});
  def('EB01/0034', {name: '忍法 半殺し', type: 'spell', counter: true, attr: ['忍法'],
    text: ['■相手の『ソウルガード』を持つモンスターの攻撃中に使える。', '■【対抗】その攻撃を無効化し、攻撃しているモンスターのソウル全てをドロップゾーンに置く。'],
    can: p => foeAttacking(p) && G.battle.atk.some(c => has(c, 'ソウルガード')),
    play: async () => {
      G.battle.nullified = true;
      for (const c of G.battle.atk) if (c.soul.length) G.p[c.owner].drop.push(...c.soul.splice(0));
    }});
  def('BT02/0044', {name: 'アルティメット・バディ！', type: 'spell', attr: ['バディ'], cost: {gauge: 1},
    text: ['■【使用コスト】ゲージ１を払う。', '■このカードを君のバディモンスターのソウルに入れる。', '■このカードが君のバディモンスターのソウルにあるなら、君のバディモンスターは『ソウルガード』を得て、攻撃力＋5000する。'],
    play: async (p, c) => {
      const b = monsters(p).find(x => x.d.name === p.buddyName) || p.buddy;
      if (b) { b.soul.push(c); c.movedToSoul = true; log(`${b.d.name} のソウルにアルティメット・バディ！`); }
    }});
  def('PR/0014', {name: 'バディチャージ', type: 'spell', attr: ['バディ'],
    text: ['■君のデッキの上から１枚をゲージに置く。さらに、君の場にバディモンスターがいるなら、君のデッキの上から１枚をゲージに置く。'],
    play: async p => { chargeTop(p, 1); if (monsters(p).some(c => c.d.name === p.buddyName)) chargeTop(p, 1); }});
  def('PR/0055', {name: '疾風剣 巻嵐', type: 'item', pow: 3000, crit: 1, attr: ['武器'], cost: {life: 1}, attackWithCenter: true,
    text: ['■【装備コスト】ライフ１を払う。', '■このカードは、君のセンターにモンスターがいても攻撃できる。']});
  def('BT05/0006', {name: '超・絶命陣', type: 'impact', set: true, attr: ['秘剣'], cost: {gauge: 1}, soulUse: '秘剣',
    text: ['■『設置』', '■このカードは「秘剣 絶命陣」としても扱う。', '■【使用コスト】ゲージ１を払い、君の手札かデッキかドロップゾーンからカード１枚を選び、裏向きでこのカードのソウルに置く。デッキを見たら、デッキをシャッフルする。', '■君はこのカードのソウルから《秘剣》を【使用コスト】を払って使える。', '■君の場の《忍者》全てを攻撃力＋1000、防御力＋1000する！！'],
    auraAll: (p, x) => isNinja(x) ? {pow: 1000, def: 1000} : null,
    play: async (p, c) => {
      const zones = [p.hand, p.deck, p.drop], all = zones.flat();
      if (!all.length) return;
      const x = await pick(p, 'ソウルに置くカードを選ぶ', uniqueCards(all));
      if (!x) return;
      const z = zones.find(z => z.includes(x));
      remove(z, x); c.soul.push(x);
      if (z === p.deck) shuffle(p.deck);
      // ソウルは裏向きなので、相手に見える記録にはカード名を出さない（持ち主はアップの「ソウルを見る」で確かめられる）
      log(`${p.name}：${c.d.name}のソウルに１枚置いた`);
    }});
  def('BT02/0008', {name: '秘剣 星砕き', type: 'impact', counter: true, attr: ['秘剣'], cost: {gauge: 3}, onlyFromSoul: true,
    text: ['■【使用コスト】ゲージ３を払う。', '■相手が魔法を使った時、このカードが「秘剣 絶命陣」のソウルにあるなら使える。(このカードは手札から使えない)', '■【対抗】相手にダメージ３！相手が使ったその魔法を無効化する。'],
    can: p => !!G.resp && !!G.resp.spell && G.resp.by === foe(p),
    play: async p => { await damage(foe(p), 3); const r = G.resp; if (r) r.nullified = true; }});

  // 竜騎士（ドラゴンワールド）
  W = 'ドラゴンワールド';
  def('CP01/0012', {name: '竜騎士 エル・キホーテ', type: 'monster', size: 1, pow: 2000, crit: 2, def: 2000, attr: ['竜騎士', '騎士'],
    text: ['■“栄光の突撃”このカードが相手にダメージを与えた時、君のデッキの上から１枚をゲージに置く。'],
    onHit: async p => chargeTop(p, 1)});
  def('BT01/0009', {name: '竜騎士 マクシミリアン', type: 'monster', size: 1, pow: 1000, crit: 1, def: 1000, attr: ['竜騎士', '騎士'],
    text: ['■このカードが登場した時、手札の《竜騎士》１枚を公開してよい。公開したら、そのカードをゲージに置き、カード１枚を引く。'],
    onEnter: async p => {
      const t = p.hand.filter(isDK); if (!t.length) return;
      const x = await pick(p, 'ゲージに置く《竜騎士》を選ぶ', t, true); if (!x) return;
      remove(p.hand, x); p.gauge.push(x); draw(p, 1);
    }});
  def('CP01/0020', {name: '竜騎士 レッドバロン', type: 'monster', size: 1, pow: 4000, crit: 1, def: 3000, attr: ['竜騎士', '騎士'], kw: ['移動'],
    text: ['『移動』']});
  def('BT05/0012', {name: '竜騎士 トモエ', type: 'monster', size: 1, pow: 5000, crit: 1, def: 2000, attr: ['竜騎士', '騎士'], cost: {gauge: 1}, onceCall: true,
    text: ['■「竜騎士 トモエ」は１ターンに１枚だけコールできる。', '■【コールコスト】ゲージ１を払う。', '■このカードが登場した時、君のドロップゾーンに《竜騎士》があるなら、カード１枚を引く。'],
    onEnter: async p => { if (p.drop.some(isDK)) draw(p, 1); }});
  def('CP01/0011', {name: '竜騎士 イワモト', type: 'monster', size: 2, pow: 3000, crit: 3, def: 3000, attr: ['竜騎士', '騎士'],
    text: ['■【起動】“送り狼”君の場にこのカード以外の《竜騎士》がいるなら、このカードを【レスト】してよい。【レスト】したら、相手の場のモンスター１枚を破壊する！'],
    acts: (p, c) => !c.rest && monsters(p).some(x => x !== c && isDK(x)) ? [{label: '【起動】レストして相手のモンスターを破壊', value: async () => {
      c.rest = true;
      const t = await pick(p, '破壊する相手のモンスターを選ぶ', monsters(foe(p))); if (t) await destroy(t);
    }}] : []});
  def('BT05/0058', {name: '竜騎士 ボクデン', type: 'monster', size: 2, pow: 5000, crit: 2, def: 5000, attr: ['竜騎士', '騎士'],
    text: ['■このカードが登場した時、君のゲージ全てを見て、その中の《竜騎士》好きな枚数を選び、ドロップゾーンに置く。その後、ドロップゾーンに置いた枚数と同じ枚数分、君のデッキの上からゲージに置く。'],
    onEnter: async p => {
      let n = 0;
      for (;;) {
        const t = p.gauge.filter(isDK); if (!t.length) break;
        const x = await pick(p, 'ドロップに置くゲージの《竜騎士》を選ぶ', t, true); if (!x) break;
        remove(p.gauge, x); p.drop.push(x); n++;
      }
      if (n) chargeTop(p, n);
    }});
  def('BT02/0009', {name: '竜騎士 ヴラド・ドラキュラ', type: 'monster', size: 2, pow: 5000, crit: 0, def: 5000, attr: ['竜騎士', '騎士'], cost: {gauge: 3},
    text: ['■【コールコスト】ゲージ３を払う。', '■“ブラッディチャージ”このカードの打撃力は、君のドロップゾーンの《竜騎士》のモンスターの枚数分増える。このカードの打撃力は最大６だぞ！！'],
    aura: p => ({crit: Math.min(6, p.drop.filter(c => c.d.type === 'monster' && isDK(c)).length)})});
  def('CP01/0002', {name: '竜騎士 ジェロニモ', type: 'monster', size: 3, pow: 1000, crit: 2, def: 7000, attr: ['竜騎士', '騎士'], kw: ['2回攻撃', 'ソウルガード'], cost: {gauge: 3},
    text: ['■【コールコスト】ゲージ３を払い、君のデッキの上から１枚をこのカードのソウルに入れる。', '■君のドロップゾーンの《竜騎士》の枚数分、このカードを攻撃力＋1000！', '『２回攻撃』『ソウルガード』'],
    onCall: async (p, c) => { if (p.deck.length) c.soul.push(p.deck.shift()); },
    aura: p => ({pow: 1000 * p.drop.filter(isDK).length})});
  def('BT05/0096', {name: 'ナイトカウンター', type: 'spell', counter: true, attr: ['竜騎士'], cost: {gauge: 3},
    text: ['■君の場に《竜騎士》があり、相手のサイズ２以下のモンスターの攻撃中に使える。', '■【使用コスト】ゲージ３を払う。', '■【対抗】相手の場のサイズ２以下のモンスター全てを破壊する。'],
    can: p => fieldCards(p).some(isDK) && foeAttacking(p) && G.battle.atk.some(c => sizeOf(c) <= 2),
    play: async p => { for (const c of monsters(foe(p)).filter(c => sizeOf(c) <= 2)) await destroy(c); }});
  def('BT01/0050', {name: '大空を手に入れて', type: 'spell', counter: true, attr: ['竜騎士'], cost: {gauge: 1}, once: true,
    text: ['■【使用コスト】ゲージ１を払う。', '■【対抗】君の場のモンスター全てを手札に戻す。「大空を手に入れて」は１ターンに１回だけ使える。'],
    can: p => monsters(p).length > 0,
    play: async p => { for (const c of [...monsters(p)]) { toZone(c, p.hand); log(`${c.d.name} を手札に戻した`); } }});
  def('EB02/0035', {name: 'ドラゴンシールド 飛竜の盾', type: 'spell', counter: true, attr: ['竜騎士', '防御'], cost: {gauge: 1},
    text: ['■君が攻撃によってダメージを受ける時、君のセンターにモンスターがいないなら使える。', '■【使用コスト】ゲージ１を払う。', '■【対抗】そのダメージを０に減らし、君のライフを＋１する！'],
    can: p => G.turn !== p.i && !p.field.center,
    play: async p => { p.damageShield = true; log(`${p.name}：飛竜の盾`); }});
  def('BT05/0004', {name: '騎竜 ハイペリオン', type: 'item', pow: 7000, crit: 2, attr: ['竜騎士', '武器'], cost: {gauge: 2}, restrictDK: true,
    text: ['■【装備コスト】ゲージ２を払う。', '■君は《竜騎士》以外のモンスターをコールできない。', '■このカードの攻撃で、相手のモンスターを破壊した時か相手にダメージを与えた時、君のデッキの上から１枚をゲージに置く。'],
    onHit: async p => chargeTop(p, 1), onDestroyHit: async p => chargeTop(p, 1)});
  def('CP01/0013', {name: '双竜剣 ドラゴアンセム', type: 'item', pow: 5000, crit: 1, attr: ['竜騎士', '武器'], kw: ['2回攻撃'], cost: {gauge: 2}, noSide: true,
    text: ['■【装備コスト】ゲージ２を払う。', '■このカードは、レフトとライトに攻撃できない。', '『２回攻撃』']});
  def('BT05/0061', {name: '竜騎奥義 ザ・グロリアスレガシー', type: 'impact', attr: ['竜騎士'], cost: {gauge: 2}, once: true,
    text: ['■君のドロップゾーンに《竜騎士》５枚以上があるなら使える。', '■【使用コスト】ゲージ２を払う。', '■カード３枚を引く。「竜騎奥義 ザ・グロリアスレガシー」は１ターンに１回だけ使える。'],
    can: p => p.drop.filter(isDK).length >= 5,
    play: async p => draw(p, 3)});
  def('CP01/0014', {name: '竜騎奥義 アルティメット・スマッシュ', type: 'impact', attr: ['竜騎士'], cost: {gauge: 4},
    text: ['■【使用コスト】ゲージ４を払う。', '■君のセンターにモンスターがいなくて、君の場に《竜騎士》２枚と《武器》があるなら使える。', '■相手の場のモンスターとアイテム、全てを破壊し、相手にダメージ３！！'],
    can: p => !p.field.center && monsters(p).filter(isDK).length >= 2 && isWeapon(p.field.item),
    play: async p => {
      for (const c of [...monsters(foe(p))]) await destroy(c);
      const it = foe(p).field.item; if (it) await destroy(it);
      await damage(foe(p), 3);
    }});

  for (const [w, wn, local] of [['01', 'ドラゴンワールド', 'myBuddy'], ['02', 'デンジャーワールド', 'myBuddy2']]) {
    def(`TD${w}/0016`, {name: `俺のバディ！（${wn}）`, type: 'monster', size: 1, pow: 1000, crit: 1, def: 1000, attr: ['バディ'], myBuddy: true, local,
      text: ['■君のデッキにバディが４枚入ってないなら、「俺のバディ！」はデッキに１枚だけ入れることができるぞ！', '■君はこのカードを使ってバディコールできる！']});
  }

  // ===== 小さな道具 =====
  const mk = (id, owner) => ({uid: ++uid, id, d: D[id], owner, rest: false, soul: [], tm: {}, bm: {}});
  // 場にいる間の常在効果（aura: 自分だけ、auraAll: 君の場のカード全てに）を足し合わせる
  function aura(c) {
    const o = {pow: 0, crit: 0, def: 0, kw: []};
    if (!areaOf(c) || areaOf(c) === 'set') return o;
    const p = G.p[c.owner];
    const add = r => { if (!r) return; for (const k of ['pow', 'crit', 'def']) o[k] += r[k] || 0; o.kw.push(...(r.kw || [])); };
    if (c.d.aura) add(c.d.aura(p, c));
    for (const s of fieldCards(p)) if (s.d.auraAll) add(s.d.auraAll(p, c, s));
    // アルティメット・バディ！をソウルに入れたバディモンスター
    if (c.soul.some(x => x.id === 'BT02/0044')) { o.pow += 5000; o.kw.push('ソウルガード'); }
    return o;
  }
  const num = v => v === Infinity ? '∞' : v;  // 画面に送る数値（∞は JSON にできないので文字にする）
  const val = (c, k) => (c.d[k] || 0) + (c.tm[k] || 0) + (c.bm[k] || 0) + aura(c)[k];
  // 場で変わるサイズ（ガイラムランスの「バディが煉獄騎士団ならサイズ−１」など）
  const sizeOf = c => Math.max(0, (c.d.size || 0) - (c.d.sizeDown ? c.d.sizeDown(G.p[c.owner], c) : 0));
  const kws = c => [...new Set([...c.d.kw, ...(c.tm.kw || []), ...(c.bm.kw || []), ...aura(c).kw])];
  const has = (c, k) => kws(c).includes(k);
  const isWeapon = c => !!c && c.d.attr.includes('武器');
  const me = () => G.p[G.turn];
  const foe = p => G.p[1 - p.i];
  const monsters = p => AREAS.map(a => p.field[a]).filter(Boolean);
  const allMonsters = () => [...monsters(G.p[0]), ...monsters(G.p[1])];
  // sets: 【設置】した魔法（場に置いたままのミッションカード）
  const fieldCards = p => [...monsters(p), p.field.item, ...p.sets].filter(Boolean);
  const allField = () => [...fieldCards(G.p[0]), ...fieldCards(G.p[1])];
  const areaOf = c => { const p = G.p[c.owner], f = p.field; return Object.keys(f).find(a => f[a] === c) || (p.sets.includes(c) ? 'set' : undefined); };
  const chargeTop = (p, n) => p.gauge.push(...p.deck.splice(0, n));
  const payLife = (p, n) => { p.life -= n; log(`${p.name}：ライフ${n}を払った（ライフ ${p.life}）`); check(); };
  // 場を離れて zone（手札・ゲージなど）へ。ソウルはドロップへ
  // 『ライフリンク』を持つモンスターが場を離れたら G.links に積み、flushLinks で解決する（破壊のときは destroy が自分で扱うので holdLink）
  const toZone = (c, zone) => {
    const p = G.p[c.owner], a = areaOf(c);
    if (a === 'set') remove(p.sets, c); else if (a) p.field[a] = null;
    if (a && a !== 'set' && c.d.lifelink && !c.holdLink) G.links.push(c);
    p.drop.push(...c.soul.splice(0)); c.tm = {}; c.bm = {}; c.rest = false; zone.push(c);
  };
  // 場を離れる効果。ソウルガードがあればソウル1枚を捨てて残り、fn は実行しない
  // 場から離れるとき、『ソウルガード』を使うかを持ち主に聞く（使えばソウル１枚を捨てて場に残る）
  async function leave(c, fn) {
    if (has(c, 'ソウルガード') && c.soul.length) {
      const use = await ask(G.p[c.owner], `${c.d.name}のソウルガードを使う？（ソウル${c.soul.length}枚）`,
        [{label: '使う', value: true}, {label: '使わない', value: false}], false, c);
      if (use && areaOf(c)) {
        // ソウルが2枚以上なら、捨てる1枚を持ち主が選ぶ（カードを見せて選ばせる）
        const s = c.soul.length > 1
          ? await ask(G.p[c.owner], `${c.d.name}のソウルガードで捨てるソウルを選ぶ`, c.soul.map(x => ({label: x.d.name, value: x, card: cardView(x)})))
          : c.soul[c.soul.length - 1];
        if (!areaOf(c)) return true;
        remove(c.soul, s); G.p[c.owner].drop.push(s);
        log(`${c.d.name} はソウルガードで場に残った（${s.d.name} を捨てた）`); return false;
      }
    }
    fn();
    await flushLinks();
    return true;
  }
  // 『ライフリンク』：場から離れたら持ち主にダメージ（即死なら負け）。自動能力なので相手は【対抗】を使える（詳細ルール ver.2.01 ⑤）
  async function lifelink(c) {
    const p = G.p[c.owner];
    await trigger(p, c, async () => {
      if (c.d.lifelink === 'lose') { p.lost = true; log(`${p.name}：ライフリンク即死`); check(); }
      else { log(`${c.d.name} のライフリンク`); await damage(p, c.d.lifelink); }
    }, abilityText(c, /ライフリンク/), 'のライフリンク');
  }
  async function flushLinks() { while (G.links.length && !G.over) await lifelink(G.links.shift()); }
  async function fromDrop(p, f, title, max) {
    for (let k = 0; k < max; k++) {
      const t = p.drop.filter(f); if (!t.length) return;
      const x = await pick(p, title, t, true); if (!x) return;
      remove(p.drop, x); p.hand.push(x); log(`${p.name}：${x.d.name} をドロップから手札に加えた`);
    }
  }
  // デッキなどから選ぶとき、同じカード（同じID）は1つだけ見せる
  const uniqueCards = cs => [...new Map(cs.map(c => [c.id, c])).values()];
  // cancel: 「〜まで」なので選ばなくてもよい
  async function searchDeck(p, f, title, cancel) {
    const t = p.deck.filter(f);
    const x = t.length && await pick(p, title, uniqueCards(t), cancel);
    if (x) { remove(p.deck, x); p.hand.push(x); log(`${p.name}：デッキから ${x.d.name} を手札に加えた`); }
    shuffle(p.deck);
  }
  // 公式ルールではジャンケンは1回で決着。勝ったときだけ『貫通』を得る（あいこ・負けでは得られない）
  async function janken(p) {
    const H = ['グー', 'チョキ', 'パー'], o = H.map((label, value) => ({label, value}));
    const [a, b] = await Promise.all([ask(p, 'ジャンケン', o), ask(foe(p), 'ジャンケン', o)]);
    log(`ジャンケン：${p.name} ${H[a]} / ${foe(p).name} ${H[b]}`);
    // 3DS版のように、両者の手を画面の真ん中に並べて見せる（hands: プレイヤー番号 → 手）
    fx('janken', '', {hands: {[p.i]: a, [foe(p).i]: b}});
    onChange();
    await sleep(castDelay * 1.4);
    return a !== b && (b - a + 3) % 3 === 1;
  }
  const battling = () => G.battle ? [...G.battle.atk, G.battle.target].filter(c => c && c !== 'fighter' && areaOf(c)) : [];
  const log = s => { G.log.unshift(s); G.log.length = Math.min(G.log.length, 300); };
  const label = c => `${G.p[c.owner].name} ${AN[areaOf(c)] || ''}：${c.d.name}${c.d.type === 'monster' ? `（${val(c, 'pow')}/${val(c, 'crit')}/${val(c, 'def')}）` : ''}`;

  // プレイヤー p に質問して、選ばれた value を返す
  // target を付けた選択肢は、画面で盤面のカード（{uid}）や置き場（{area, owner}）をタップしても選べる
  function ask(p, title, opts, cancel, card, extra) {
    if (check()) return new Promise(() => {});  // 決着したら、その先の処理は進めない（新しいゲームで作り直す）
    if (cancel) opts = [...opts, {label: 'キャンセル', value: null}];
    return new Promise(res => {
      // cards: 場にないカード（ソウルなど）から選ぶときに、選択肢ごとのカードを画面に出す
      // extra: 画面の都合で添える情報（ゲージの払う枚数など）
      pending[p.i] = {id: ++promptSeq, title, labels: opts.map(o => o.label), targets: opts.map(o => o.target || null),
        cards: opts.some(o => o.card) ? opts.map(o => o.card || null) : null,
        card: card ? cardView(card) : null, ...extra, resolve: i => res(opts[i].value)};
      onChange();
    });
  }
  // 選べるカードがないときは聞かずに null（相手の【対抗】で対象がいなくなることがある）
  const pick = (p, title, cards, cancel) => !cards.length ? Promise.resolve(null) : ask(p, title, cards.map(c => ({label: areaOf(c) ? label(c) : c.d.name, value: c, target: {uid: c.uid}})), cancel);
  // コストのゲージで払う（ドロップに置く）カードを、場のゲージから選ぶ。ゲージは裏向きなので、何のカードかは見せず位置（上から何枚目）で選ぶ。
  // 選んでいる最中のカードは G.gaugePick に置き、画面で光らせる。全部払うときは聞かない。
  // 1枚も聞かなかったときは、3DS版と同じく払う前に確かめる。やめたら null（cancel が false ならやめられず、確かめもしない）
  async function chooseGauge(p, cost, c, cancel = true) {
    const n = cost.gauge || 0, chosen = [];
    if (!n) return chosen;
    if (p.gauge.length < n) return null;
    if (p.gauge.length === n) chosen.push(...p.gauge);
    G.gaugePick = {owner: p.i, cards: chosen};
    try {
      let asked = false;
      while (chosen.length < n) {
        const opts = p.gauge.map((x, k) => ({x, k})).filter(o => !chosen.includes(o.x))
          .map(({x, k}) => ({label: `ゲージ 上から${k + 1}枚目`, value: x, target: {gauge: k, owner: p.i}}));
        const x = await ask(p, `使うゲージを選ぼう！ 場のゲージをタップ（${n}枚払う。あと${n - chosen.length}枚）`, opts, cancel, c, {gaugeCost: n});
        if (!x) return null;
        chosen.push(x); asked = true;
      }
      if (cancel && !asked && !await ask(p, `使うゲージを決めよう！（ゲージ ${n}枚を払う。今 ${p.gauge.length}枚）`, [{label: 'けってい', value: true}], true, c)) return null;
      return chosen;
    } finally { G.gaugePick = null; }
  }
  // 3DS版の演出用。画面が順に帯やカットインを出す
  function fx(kind, text, extra = {}) { G.fx.push({seq: ++fxSeq, kind, text, ...extra}); if (G.fx.length > 12) G.fx.shift(); }
  // noCenter のカード（迅雷騎士団 ブロードソード・ドラゴン）はセンターを選べない
  async function chooseArea(p, c, buddy, from) {
    const m = buddy ? p.buddy : c;
    // 「ドラムを含むモンスターの上に重ねる」カードは、重ねる相手を選んでそのエリアにコールする
    if (m.d.stackOn) {
      const t = monsters(p).filter(x => x.d.name.includes(m.d.stackOn));
      const pickT = t.length > 1 ? await pick(p, `重ねる「${m.d.stackOn}」を選ぶ`, t) : t[0];
      if (!pickT) return;
      await call(p, c, areaOf(pickT), buddy, from);
      return;
    }
    const a = await ask(p, 'コールするエリアを決めよう！', AREAS.filter(a => !(m.d.noCenter && a === 'center')).map(a => ({label: AN[a], value: a, target: {area: a, owner: p.i}})), true, c);
    if (a) await call(p, c, a, buddy, from);
  }

  // name はログや質問に書くファイターの名前。見る人ごとに「自分」「相手」へ置き換える（view）。deckName はデッキの名前
  const NAME = i => `⟪P${i}⟫`;
  function mkPlayer(i, dk) {
    const p = {i, set: dk.set, flagSet: dk.set || dk.flagSet, local: dk.local, name: NAME(i), deckName: dk.name, flag: dk.flag, life: 10, deck: [], hand: [], gauge: [], drop: [], sets: [], field: {left: null, center: null, right: null, item: null}, buddyCalled: false, used: {}};
    if (dk.cards) {
      for (const id in dk.cards) for (let k = 0; k < dk.cards[id]; k++) p.deck.push(mk(id, i));
      p.buddy = mk(dk.buddy, i);
    } else {
      for (const id in D) if (id.startsWith(dk.set) && D[id].n) for (let k = 0; k < D[id].n; k++) p.deck.push(mk(id, i));
      p.buddy = p.deck.splice(p.deck.findIndex(c => c.id === dk.buddy), 1)[0];
      p.deck.push(mk(`${dk.set}/0016`, i));
    }
    p.buddyName = p.buddy.d.name;  // 君のバディモンスター＝バディと同じ名前のモンスター（バディコールで p.buddy は入れ替わる）
    p.ids = new Set(p.deck.map(c => c.id));
    shuffle(p.deck);
    return p;
  }

  // 新しいゲーム：両者に同時にデッキを選んでもらってから配る
  function newGame() {
    uid = 0; busy = false; answering = false; pending[0] = pending[1] = null; lastIdle = {snap: null, acts: []}; undoStack = [];
    G = {rng: typeof seed === 'number' ? seed | 0 : null, p: [mkPlayer(0, DECKS[0]), mkPlayer(1, DECKS[1])], turn: 0, turnNo: 1, phase: 'deck', attacks: 0, battle: null, over: null, sel: [], log: [], casting: [], fx: [], extraTurn: null, links: []};
    G.turn = nextRng() < .5 ? 0 : 1;   // 先攻も種から決める（seed なしなら Math.random）
    log('デッキを選んでください');
    onChange();
    run(async () => {
      const opts = DECKS.map((dk, k) => ({label: `${dk.name}（${dk.flag}）`, value: k}));
      let ks;
      if (botSeat === 0 || botSeat === 1) {
        const human = G.p[1 - botSeat];
        const mine = await ask(human, '使うデッキを選ぶ', opts);
        const theirs = await ask(human, '相手のデッキを選ぶ', [{label: 'ランダム', value: -1}, ...opts]);
        ks = [];
        ks[human.i] = mine;
        ks[botSeat] = theirs === -1 ? nextRng() * DECKS.length | 0 : theirs;
      } else ks = await Promise.all(G.p.map(p => ask(p, '使うデッキを選ぶ', opts)));
      G.p = ks.map((k, i) => mkPlayer(i, DECKS[k]));
      for (const p of G.p) { draw(p, 6); p.gauge.push(...p.deck.splice(0, 2)); }
      log(`${G.p[0].name}：${G.p[0].deckName} 対 ${G.p[1].name}：${G.p[1].deckName}。${me().name} の先攻`);
      await startTurn();
    });
  }

  // ===== 基本処理 =====
  function draw(p, n) { for (let k = 0; k < n && p.deck.length; k++) p.hand.push(p.deck.shift()); check(); }
  // fixed: 減らないダメージ（必殺技）。チェレックス！で0にできない
  // 戻り値は実際にダメージを与えたか（０に減らした時は false。「ダメージを与えた時」の能力は発動しない）
  async function damage(p, n, fixed) {
    // 黒竜の盾は使えても減らないダメージは軽減できない。構えた分はそのダメージで使い切る（後のダメージに残さない）
    if (p.damageShield) {
      p.damageShield = false;
      if (!fixed) { log(`${p.name}：黒竜の盾でダメージを0にした`); heal(p, 1); return false; }
    }
    // ダメージを受ける時、黒竜の盾を手札から使える。星砕きのように【対抗】の解決中に受けるダメージにも使える
    const shield = !fixed && !p.field.center && p.hand.find(c => c.d.shieldDamage);
    if (shield) {
      const use = await ask(p, `黒竜の盾を使う？（${n}ダメージを0にして、ライフ＋1）`,
        [{label: '使う', value: true}, {label: '使わない', value: false}], false, shield);
      if (use) {
        // 魔法をキャストしたので「キャスト」の帯を出す（通常のキャストと同じ見せ方）
        await castBand(p, shield, () => {
          remove(p.hand, shield); p.drop.push(shield);
          log(`${p.name}：黒竜の盾でダメージを0にした`); heal(p, 1);
        });
        return false;
      }
    }
    if (!fixed && p.chillax === G.turnNo) { p.chillax = null; log(`${p.name}：チェレックス！でダメージを0にした`); heal(p, 1); return false; }
    p.life = Math.max(0, p.life - n); log(`${p.name} に ${n} ダメージ（ライフ ${p.life}）`); fx('damage', String(n), {to: p.i});
    // ライフが０になるなら発動する復活能力。アイテムの「奇跡の復活」→【設置】の「その身を砕き、我を支えよ」の順
    if (p.life === 0) {
      const it = p.field.item;
      if (it && it.d.revive) {
        // カードに書かれた能力なので、ほかの自動能力と同じく「能力発動」を出してから解決する
        await ability(p, it, () => {
          toDrop(it); log(`${it.d.name} の奇跡の復活`);
          const top = p.deck.shift();
          if (top) { p.drop.push(top); log(`${top.d.name} を公開して捨てた`); if (top.d.type === 'spell') { p.life = 3; log(`${p.name} のライフは3になった！`); } }
        }, abilityText(it, /復活/));
      }
      if (p.life === 0) {
        const s = p.sets.find(x => x.d.reviveSet);
        if (s) {
          // カードに書かれた能力なので、ほかの自動能力と同じく「能力発動」を出してから解決する
          await ability(p, s, () => {
            remove(p.sets, s); p.drop.push(s); log(`${s.d.name} をドロップに置いた`);
            const top = p.deck.shift();
            if (top) { p.drop.push(top); log(`${top.d.name} を公開して捨てた`); if (top.d.type === 'spell') { p.life = 2; log(`${p.name} のライフは2になった！`); } }
          }, abilityText(s, /ライフが０になるなら/));
        }
      }
    }
    check();
    // ダメージを受けた時が使えるタイミングの【対抗】。相手のターン中にダメージを受けたら、ライフを減らしたあと本人に聞く
    if (!G.over && G.turn !== p.i) {
      const prev = damageTiming;
      damageTiming = p;
      try {
        for (const c of [...p.hand]) {
          if (!c.d.dmgTiming || !canUse(p, c)) continue;
          const use = await ask(p, `${c.d.name}を使う？（ダメージを受けた時）`,
            [{label: '使う', value: true}, {label: '使わない', value: false}], false, c);
          if (use) await useCard(p, c);
          if (G.over) break;
        }
      } finally { damageTiming = prev; }
    }
    return true;
  }
  function heal(p, n) { p.life += n; log(`${p.name} のライフ +${n}（ライフ ${p.life}）`); fx('heal', `+${n}`, {to: p.i}); }
  // ★ルール処理★（詳細ルール ver.2.01）：ライフが0以下かデッキが0枚のファイターは負け。ダメージ・ドロー・質問の前に見る
  function check() {
    if (G.over) return true;
    if (G.phase === 'deck') return false;
    for (const p of G.p) {
      if (p.lost || p.life <= 0 || !p.deck.length) {
        G.over = foe(p); log(`${foe(p).name} の勝ち！`); fx('win', '勝利', {to: foe(p).i});
        pending[0] = pending[1] = null;  // 出ていた質問は取り下げる
        onChange();
        return true;
      }
    }
    return false;
  }
  const toDrop = c => toZone(c, G.p[c.owner].drop);
  // ctx.by: このカードを攻撃で破壊したカードたち（ミッションカードの判定に使う）
  // 破壊されたら true を返す。逆鱗・ドラゴン・バリアー・ソウルガードなどで場に残っても、破壊はされたので true（『貫通』の判定に使う）
  async function destroy(c, ctx = {}) {
    if (!c || !areaOf(c)) return false;
    const p = G.p[c.owner], area = areaOf(c);
    // 「破壊された時」に誘発する設置カード（ナザロの温泉宿・モンスター討伐！）。ソウルガードなどで場に残っても破壊されたので誘発する
    const killed = async () => {
      if (!ctx.by || c.d.type !== 'monster') return;
      const a = foe(p);
      if (ctx.by.some(isAdv)) for (const s of [...a.sets]) if (s.d.onFoeKilled) await later(a, () => setAbility(a, s, 'onFoeKilled', /破壊された時/));
      if (isAdv(c)) for (const s of [...p.sets]) if (s.d.onOwnKilled) await later(p, () => setAbility(p, s, 'onOwnKilled', /破壊された時/));
    };
    // 破壊されたモンスター自身・自分の場のカードが誘発する能力。ソウルガードなどで場に残っても「破壊された」ので誘発する
    const destroyedAbilities = async () => {
      if (c.d.type !== 'monster') return;
      if (c.d.onDestroyed && !ctx.by && G.phase === 'attack') await trigger(p, c, () => c.d.onDestroyed(p, c), abilityText(c, /破壊された時/));
      if (!ctx.by && RK(c)) for (const s of [...p.sets]) if (s.d.onTKDestroyed) await setAbility(p, s, 'onTKDestroyed', /破壊された時/, c);
      const it = p.field.item;
      if (it && it.d.onMonsterDestroyed && p.used[it.id] !== G.turnNo) {
        p.used[it.id] = G.turnNo;
        await trigger(p, it, () => it.d.onMonsterDestroyed(p, it), abilityText(it, /破壊された時/));
      }
    };
    if (c.tm.stay) { const h = c.tm.stay.heal; delete c.tm.stay; log(`${c.d.name} は場に残った`); if (h) heal(p, h); await killed(); return true; }
    if (c.d.type === 'monster' && sizeOf(c) >= 2 && p.barrier === G.turnNo) { p.barrier = null; log(`ドラゴン・バリアーで ${c.d.name} は場に残った`); await killed(); return true; }
    c.holdLink = true;
    const gone = await leave(c, () => toDrop(c));
    delete c.holdLink;
    if (!gone) { await destroyedAbilities(); await killed(); return true; }  // ソウルガードで場に残った（破壊されたことにはなる）
    log(`${c.d.name} を破壊`);
    await destroyedAbilities();
    // 破壊された時にコールできるカード（デュエルズィーガーの進化）。コールしたらライフリンクは無効
    let linked = !!c.d.lifelink;
    const evo = p.hand.filter(x => x.d.evolveFrom === c.id && canPay(p, x.d.cost, x));
    const e = evo.length && await pick(p, `${c.d.name} が破壊された。コールするカードを選ぶ`, evo, true);
    if (e) {
      linked = false;
      await call(p, e, area);
      if (e.d.evolveSoul && p.drop.includes(c)) { remove(p.drop, c); e.soul.push(c); }
    }
    if (linked) await lifelink(c);
    await killed();
    return true;
  }
  // 天竺 総一朗：君の場にいる枚数だけ、＜マジックワールド＞の魔法の使用コストをゲージ１少なくする
  const costOf = (p, c) => {
    const down = c.d.type === 'spell' && c.d.world === 'マジックワールド' ? monsters(p).filter(x => x.d.costDown).length : 0;
    return down ? {...c.d.cost, gauge: Math.max(0, (c.d.cost.gauge || 0) - down)} : c.d.cost;
  };
  // ライフを払うコストは、払った後にライフが残るときだけ払える
  const canPay = (p, cost, self) => p.gauge.length >= (cost.gauge || 0) && p.hand.filter(x => x !== self).length >= (cost.discard || 0) && p.life > (cost.life || 0) && p.life > (cost.damage || 0);
  // gauge: chooseGauge で選んだカード。選んでいないとき（能力のコストなど）は、ここで選ぶ
  async function pay(p, cost, gauge) {
    gauge ||= await chooseGauge(p, cost, null, false) || [];
    for (let k = 0; k < (cost.discard || 0); k++) { const x = await pick(p, '捨てる手札を選ぶ', p.hand); remove(p.hand, x); p.drop.push(x); log(`${p.name}：${x.d.name} を捨てた`); }
    for (const x of gauge) if (p.gauge.includes(x)) { remove(p.gauge, x); p.drop.push(x); }
    if (cost.life) payLife(p, cost.life);
    if (cost.damage) await damage(p, cost.damage);
  }
  // 発動した能力の文章。re に合う効果の行（なければ効果の行すべて）
  const abilityText = (c, re) => { const t = c.d.text.filter(x => x.startsWith('■')), m = t.filter(x => re.test(x)); return m.length ? m : t; };
  const canUse = (p, c) => canPay(p, costOf(p, c), c) && (!c.d.once || p.used[c.id] !== G.turnNo) && (!c.d.can || c.d.can(p, c));

  // ===== ターン =====
  // 各フェイズの開始時と終了時に、相手（非ターンファイター）へ【対抗】を使うか必ず聞く。
  // 使える【対抗】がなくても聞くので、すぐ進むかどうかで手札が読まれない。
  // ターンファイターは自分のターン中なら、手札をタップしていつでも【対抗】を使える。
  const PN = {charge: 'チャージ＆ドロー', main: 'メインフェイズ', attack: 'アタックフェイズ', final: 'ファイナルフェイズ'};
  async function startTurn() {
    const p = me();
    // 前のターンの「1手戻す」は残す（相手ターン中に、自分の最後の手まで戻せるようにする）
    G.phase = 'charge'; G.attacks = 0; G.sel = [];
    for (const c of fieldCards(p)) c.rest = false;
    // 2018/6/2 の改定より前のルール：先攻1ターン目のスタートフェイズはドローしない
    if (G.turnNo !== 1) draw(p, 1);
    log(`── ${G.turnNo}ターン目 ${p.name} ──`);
    fx('phase', `${p.name}のターン`);
    if (G.turnNo !== 1) fx('phase', 'ドロー');
    if (!check()) await counterTiming(`${PN.charge}開始時`);
  }
  async function nextPhase() {
    await counterTiming(`${PN[G.phase]}終了時`);
    if (G.over) return;
    if (G.phase === 'final') return endTurn();
    G.phase = {charge: 'main', main: 'attack', attack: 'final'}[G.phase];
    G.sel = [];
    fx('phase', PN[G.phase]);
    // 『移動』はアタックフェイズの開始時、プレイタイミング（【対抗】）より前（詳細ルール ver.2.01 ③1.1.）
    if (G.phase === 'attack') await moveTiming();
    if (!G.over) await counterTiming(`${PN[G.phase]}開始時`);
  }
  async function endTurn() {
    fx('turnend', 'ターンエンド');
    for (const p of G.p) for (const c of fieldCards(p)) c.tm = {};
    // マイ・グランファーザークロック：もう一度同じファイターのターン
    if (G.extraTurn === G.turn) { G.extraTurn = null; log(`${me().name} のもう一度のターン`); } else G.turn = 1 - G.turn;
    G.turnNo++;
    await startTurn();
  }
  // 『移動』：アタックフェイズの開始時、ターンファイターから順に、空いているエリアへ動かせる（1枚1回）。【対抗】はできない
  async function moveTiming() {
    for (const q of [me(), foe(me())]) {
      const moved = new Set();
      for (;;) {
        const free = AREAS.filter(a => !q.field[a]);
        const o = [];
        for (const c of monsters(q)) if (has(c, '移動') && !moved.has(c)) for (const a of free) o.push({label: `${c.d.name} を${AN[a]}へ`, value: [c, a]});
        if (!o.length) break;
        const m = await ask(q, '『移動』しますか？（アタックフェイズ開始時）', [...o, {label: '移動しない', value: null}]);
        if (!m) break;
        const [c, a] = m;
        q.field[areaOf(c)] = null; q.field[a] = c; moved.add(c);
        log(`${q.name}：${c.d.name} を${AN[a]}へ移動`);
      }
    }
  }
  // 値は選ばれたら実行する関数。手札の【対抗】魔法、手札から使う【対抗】【起動】、場のカードの【対抗】【起動】
  const counterOptions = q => {
    const opts = [], seen = new Set();
    for (const c of q.hand) if (c.d.counter && canUse(q, c) && !seen.has(c.id)) { seen.add(c.id); opts.push({label: c.d.name, value: () => useCard(q, c), target: {uid: c.uid}}); }
    for (const c of q.hand) if (c.d.handCounter && c.d.handCounter.can(q, c) && !seen.has(c.id)) { seen.add(c.id); opts.push({label: `${c.d.name}：${c.d.handCounter.label}`, value: () => useAbility(q, c, c.d.handCounter), target: {uid: c.uid}}); }
    for (const c of fieldCards(q)) if (c.d.fieldCounter && c.d.fieldCounter.can(q, c)) opts.push({label: `${c.d.name}：${c.d.fieldCounter.label}`, value: () => useAbility(q, c, c.d.fieldCounter), target: {uid: c.uid}});
    // 場のモンスターの【対抗】【起動】（ディミオスソードの「破壊してスタンド」など）。カードに「君のターン中」とあるので、その人のターンだけ出す。
    // ここは【対抗】の手順の中なので、相手に【対抗】を返させない（trigger ではなく ability を直接呼ぶ）
    for (const c of fieldCards(q)) if (G.turn === q.i && c.d.counterAct && c.d.acts)
      for (const a of c.d.acts(q, c)) opts.push({label: `${c.d.name}：${a.label}`, value: () => ability(q, c, a.value, a.text || abilityText(c, /【起動】/)), target: {uid: c.uid}});
    // 【設置】したカードのソウルから使う魔法・必殺技（忍び巻物の《忍法》、超・絶命陣の《秘剣》など）
    for (const s of q.sets) if (s.d.soulUse) for (const c of s.soul)
      if (c.d.counter && (c.d.type === 'spell' || c.d.type === 'impact') && c.d.attr.includes(s.d.soulUse) && canUse(q, c)) {
        opts.push({label: `${c.d.name}（${s.d.name}のソウル）`, value: () => useCard(q, c, s.soul), target: {uid: c.uid}});
      }
    return opts;
  };
  // 【対抗】【起動】の能力：コストを払ってから相手の【対抗】、そのあと効果（詳細ルール ver.2.01 ⑤1.）
  const useAbility = (q, c, a) => ability(q, c, async () => {
    await a.pay(q, c);
    await respond(q, `${c.d.name}の${a.label.replace(/（.*/, '')}`);
    if (!G.over) await a.run(q, c);
  }, abilityText(c, /【起動】/));
  // 3DS版と同じく、まず「パス／えらぶ」を聞く。使える【対抗】がなくても同じように聞くので、手札は読まれない
  // （bot.js は開始時・終了時の確認で最後の選択肢を選ぶので、「パス」は必ず最後に置く）
  async function askCounter(q, title) {
    // 外から操作する席（AI）には、使える【対抗】と「パス」を1つの質問で出す（「えらぶ」→「もどる」の空振りをなくす。パスは最後）
    if (q.i === botSeat) return ask(q, title, [...counterOptions(q), {label: 'パス', value: null}]);
    for (;;) {
      if (!await ask(q, title, [{label: 'えらぶ', value: true}, {label: 'パス', value: null}])) return null;
      const opts = counterOptions(q);
      if (!opts.length) { await ask(q, '今使える【対抗】はない', [{label: 'もどる', value: null}]); continue; }
      const c = await ask(q, '使う【対抗】を選ぼう！', opts, true);
      if (c) return c;
    }
  }
  // プレイタイミング（詳細ルール ver.2.01 ②）。ターンファイターは自分で操作して使うので、ここでは非ターンファイターに聞く（②6.）。
  // 非ターンファイターが使ったら、その解決の前にターンファイターが【対抗】を1回返せる（②7.、respond が聞く）。使ったらもう一度聞く
  async function counterTiming(when) {
    const q = foe(me());
    for (let f; !G.over && (f = await askCounter(q, `対抗を使うかを決めよう！（${me().name}の${when}）`));) await f();
  }

  // ===== コール・装備・使用 =====
  // from: コールする前にカードがあるところ（手札。コンティニュー！ならドロップ）
  async function call(p, c, area, buddy, from = p.hand) {
    const called = buddy ? p.buddy : c;
    if (called.d.callCan && !called.d.callCan(p, called)) return;
    const g = await chooseGauge(p, called.d.cost, called);
    if (!g) return;
    remove(from, c);
    let m = c;
    if (buddy) { m = p.buddy; p.buddy = c; }  // 手札の同名カード（俺のバディ！）をバディゾーンへ置き、バディゾーンのカードをコール
    await pay(p, m.d.cost, g);
    if (m.d.onCall) await m.d.onCall(p, m);  // コストの残り（ソウルに入れるなど）
    await respond(p, `${m.d.name}の${buddy ? 'バディ' : ''}コール`);
    if (G.over) return;
    const old = p.field[area];
    if (old) {
      // 「〜の上に重ねる」コール：下のカードはソウルに入れる（ドラムブレイカー）
      if (m.d.stackOn) {
        p.field[area] = null;
        m.soul.push(old, ...old.soul.splice(0));
        log(`${old.d.name} を ${m.d.name} のソウルに入れた`);
      } else {
        toDrop(old); log(`${old.d.name} をドロップへ（同じ${AN[area]}にコールしたため）`); await flushLinks();
      }
    }
    p.field[area] = m;
    if (m.d.onceCall) p.used[m.id] = G.turnNo;
    log(`${p.name}：${m.d.name} を${AN[area]}に${buddy ? 'バディ' : ''}コール`);
    fx('call', buddy ? 'バディコール' : 'コール', {card: cardView(m), by: p.name});
    while (monsters(p).reduce((s, x) => s + sizeOf(x), 0) > 3) {
      const x = await pick(p, 'サイズ合計が3を超えた。ドロップに置くモンスターを選ぶ', monsters(p).filter(x => x !== m));
      toDrop(x); log(`${x.d.name} をドロップへ（サイズ超過）`);
      await flushLinks();
    }
    if (buddy) { p.buddyCalled = true; log('バディギフト'); heal(p, 1); }
    if (m.d.onEnter && areaOf(m) && !G.over) await trigger(p, m, () => m.d.onEnter(p, m), abilityText(m, /登場した時/));
    // 相手の場にモンスターが登場した時に誘発する設置カード
    if (areaOf(m) && !G.over) for (const s of [...foe(p).sets]) if (s.d.onFoeEnter) await trigger(foe(p), s, () => s.d.onFoeEnter(foe(p), s, m), abilityText(s, /登場した時/));
  }
  async function equip(p, c) {
    const g = await chooseGauge(p, c.d.cost, c);
    if (!g) return;
    remove(p.hand, c);
    await pay(p, c.d.cost, g);
    await respond(p, `${c.d.name}の装備`);
    if (G.over) { p.drop.push(c); return; }
    const old = p.field.item;
    p.field.item = c;
    log(`${p.name}：${c.d.name} を装備`);
    if (old) { toDrop(old); log(`${old.d.name} をドロップへ（装備を替えたため）`); }
    fx('equip', '装備', {card: cardView(c), by: p.name});
  }
  // 能力が発動したら、魔法と同じく場の真ん中に「能力発動」とそのカード、その能力の文章（text）を出してから解決する
  async function ability(p, c, fn, text) {
    const e = {c, p, ability: true, text};
    G.casting.push(e); onChange();
    await sleep(castDelay * 0.7);
    try { await fn(); } finally {
      onChange();
      await sleep(castDelay / 3);
      remove(G.casting, e);
    }
  }
  // 自動能力（「〜した時」）と【起動】の解決：相手に【対抗】のタイミングがあり、そのあと効果を解決する。
  // 【対抗】で発生源が場を離れても解決する（離れたら解決しないという決まりは詳細ルール ver.2.01 にない）
  const trigger = (p, c, fn, text, what = 'の能力') => ability(p, c, async () => { await respond(p, `${c.d.name}${what}`); if (!G.over) await fn(); }, text);
  // 【設置】したカードの能力。効果でそのカード自身を動かすので、まだ置かれているときだけ解決する
  const setAbility = (p, s, key, re, ...args) => trigger(p, s, async () => { if (p.sets.includes(s)) await s.d[key](p, s, ...args); }, abilityText(s, re));
  // バトル中に起きた「ダメージを与えた時」「破壊された時」などの能力は、バトルの後（③3.4.）にまとめて解決する
  async function later(p, fn) { if (G.battle) G.battle.after.push({p, fn}); else await fn(); }
  // カードを使ったときの帯（キャスト・必殺技）を出してから効果を解決する。
  // 通常の使用（useCard）と、ダメージを受ける時に手札から使う盾（damage の中）で共有する
  async function castBand(p, c, fn) {
    G.casting.push({c, p}); onChange();
    await sleep(castDelay);
    try { await fn(); } finally {
      onChange();
      await sleep(castDelay / 2);
      remove(G.casting, G.casting.find(x => x.c === c && !x.ability));
    }
  }
  async function useCard(p, c, from = p.hand) {
    const cost = costOf(p, c), g = await chooseGauge(p, cost, c);
    if (!g) return false;
    remove(from, c);
    await pay(p, cost, g);
    if (c.d.once) p.used[c.id] = G.turnNo;
    log(`${p.name}：${c.d.name}`);
    // 解決が終わるまで場の真ん中に出しておく（必殺技は横向き）。【対抗】で重なることがあるので積んでおく
    G.casting.push({c, p}); onChange();
    await sleep(castDelay);
    // 偽りの邪竜 デモニカは、この宣言への【対抗】として魔法を無効化できる（G.resp を見る）
    const prev = G.resp;
    const r = {spell: c.d.type === 'spell', impact: c.d.type === 'impact', by: p, nullified: false, prev};
    G.resp = r;
    await respond(p, `${c.d.name}のキャスト`);
    G.resp = prev;
    if (r.nullified) log(`${c.d.name} は無効化された`);
    else if (!G.over && c.d.play) await c.d.play(p, c);
    onChange();
    await sleep(castDelay / 2);
    remove(G.casting, G.casting.find(x => x.c === c && !x.ability));
    if (!r.nullified && c.d.set) {
      p.sets.push(c); log(`${c.d.name} を【設置】`);
      for (const s of [...p.sets]) if (s !== c && s.d.onOtherSet && p.sets.includes(s)) await setAbility(p, s, 'onOtherSet', /【設置】された時/, c);
    } else if (!r.nullified && c.movedToSoul) {
      log(`${c.d.name} をソウルに入れた`);
    } else p.drop.push(c);
    return true;
  }

  function handOptions(p, c) {
    const d = c.d, o = [];
    if (G.phase === 'main') {
      const dkOK = !(p.field.item && p.field.item.d.restrictDK) || d.attr.includes('竜騎士');
      if (d.type === 'monster' && !d.evolveFrom && dkOK && (!d.onceCall || p.used[d.id] !== G.turnNo) && canPay(p, d.cost, c) && (!d.callCan || d.callCan(p, c)) && (!d.stackOn || monsters(p).some(x => x.d.name.includes(d.stackOn)))) o.push({label: 'コール', value: () => chooseArea(p, c, false)});
      if (d.type === 'monster' && dkOK && !p.buddyCalled && (d.name === p.buddy.d.name || d.myBuddy) && canPay(p, p.buddy.d.cost, c))
        o.push({label: `バディコール（${p.buddy.d.name}・ライフ+1）`, value: () => chooseArea(p, c, true)});
      if (d.type === 'item' && canPay(p, d.cost, c)) o.push({label: '装備', value: () => equip(p, c)});
      if ((d.type === 'spell' || (d.type === 'impact' && d.set)) && !d.onlyFromSoul && canUse(p, c)) o.push({label: 'キャスト', value: () => useCard(p, c)});
      if (d.handAct && d.handAct.can(p, c)) o.push({label: d.handAct.label, value: () => useAbility(p, c, d.handAct)});
    } else if (G.phase === 'attack' || G.phase === 'final') {
      if ((d.counter || (d.type === 'impact' && G.phase === 'final')) && !d.onlyFromSoul && canUse(p, c)) o.push({label: 'キャスト', value: () => useCard(p, c)});
    }
    return o;
  }

  // 【設置】したカードのソウルから使える魔法（忍び巻物の《忍法》など）。必殺技は【対抗】のタイミングで counterOptions が出す
  const soulUseOptions = (p, c) => !c.d.soulUse ? [] : c.soul
    .filter(x => x.d.type === 'spell' && !x.d.counter && x.d.attr.includes(c.d.soulUse) && canUse(p, x))
    .map(x => ({label: `ソウルの《${x.d.name}》を使う`, soul: true, value: () => useCard(p, x, c.soul)}));

  // ===== 攻撃 =====
  const canAttack = () => !(G.turnNo === 1 && G.attacks >= 1);
  function chooseTarget(p) {
    const o = foe(p), t = monsters(o).map(c => ({label: label(c), value: c}));
    if (!o.field.center) t.push({label: `${o.name}のフラッグ（ファイターを攻撃）`, value: 'fighter'});
    return ask(p, '攻撃する相手を選ぶ', t);
  }
  async function attack(atk, target) {
    const p = me(), o = foe(p), tArea = target === 'fighter' ? null : areaOf(target);
    for (const c of atk) c.rest = true;
    G.attacks++; G.sel = [];
    // used: このバトルの【対抗】のタイミング（③2.5.）で【対抗】を使ったファイター（各1回まで）。window: そのタイミングの最中か
    // after: バトルの後（③3.4.）に解決する能力
    G.battle = {atk, target, att: p, def: o, nullified: false, used: new Set(), window: true, after: []};
    log(`${p.name}：${atk.map(c => c.d.name).join(' + ')} で ${target === 'fighter' ? o.name + '（ファイター）' : target.d.name} を攻撃`);
    // 「攻撃した時」の能力は、このバトルの【対抗】のタイミングで解決する（③2.5.）
    for (const c of atk) if (c.d.onAttack && areaOf(c) && !G.over) await trigger(p, c, () => c.d.onAttack(p, c, atk, target), abilityText(c, /攻撃した時/));
    await counterWindow();
    G.battle.window = false;
    const live = atk.filter(areaOf);
    // 相手にダメージを与えた時の能力（鉄拳 ドラゴナックル、ガラスの魔術師など）は、バトルの後に解決する
    const hit = async (n, cs) => {
      // ０に減らされたダメージは「与えた」ことにならないので、その時は「ダメージを与えた時」の能力を発動しない
      const dealt = await damage(o, n, !!(G.battle && G.battle.unreduce));
      if (!dealt) return;
      for (const c of cs) if (c.d.onHit && areaOf(c)) await later(p, () => trigger(p, c, () => c.d.onHit(p, c), abilityText(c, /ダメージを与えた時/)));
    };
    if (G.battle.nullified) log('攻撃は無効化された');
    else if (live.length && target === 'fighter') await hit(live.reduce((s, c) => s + val(c, 'crit'), 0), live);
    else if (live.length && areaOf(target)) {
      const sp = live.reduce((s, c) => s + val(c, 'pow'), 0), df = val(target, 'def');
      if (sp >= df) {
        log(`ヒット（攻撃力 ${num(sp)} ≧ 防御力 ${df}）`);
        const pen = live.filter(c => has(c, '貫通'));  // 破壊で場を離れると能力を参照できないので先に見ておく
        const broke = await destroy(target, {by: live});
        // 「このカードの攻撃で相手のモンスターを破壊した時」の能力（騎竜 ハイペリオン）
        if (broke) for (const c of live) if (areaOf(c) && c.d.onDestroyHit) await later(p, () => trigger(p, c, () => c.d.onDestroyHit(p, c), abilityText(c, /破壊した時/)));
        if (tArea === 'center' && broke) for (const c of pen) if (areaOf(c)) { log(`${c.d.name} の貫通`); await hit(val(c, 'crit'), [c]); }
      } else log(`攻撃力が足りない（${sp} ＜ ${df}）`);
      if (areaOf(target) && has(target, '反撃')) {
        const cand = live.filter(c => c.d.type === 'monster' && areaOf(c) && val(c, 'def') <= val(target, 'pow'));
        if (cand.length) { log(`${target.d.name} の反撃`); await destroy(cand.length > 1 ? await pick(o, '反撃で破壊するモンスターを選ぶ', cand) : cand[0]); }
      }
    }
    // ③3.3. ここで「バトル中」が終わる（「このバトル中」の強化も終わる）
    for (const c of [...atk, target]) if (c !== 'fighter') c.bm = {};
    const after = G.battle.after;
    G.battle = null;
    if (check()) return;
    // ③3.4. プレイタイミング：バトル中に起きた能力を、ターンファイターの分から解決し、相手も【対抗】を使える
    for (const t of [...after.filter(t => t.p === p), ...after.filter(t => t.p !== p)]) { if (G.over) return; await t.fn(); }
    if (!G.over) await counterTiming('バトルの後');
    // バトル終了時に手札に戻る／デッキの下に置く（カードに書かれた能力なので、ほかの自動能力と同じく「能力発動」を出して【対抗】のタイミングを取る）
    for (const c of atk.filter(areaOf)) {
      if (c.d.bounce) await trigger(p, c, async () => { toZone(c, p.hand); log(`${c.d.name} を手札に戻した`); }, abilityText(c, /バトル終了時/));
      else if (c.d.battleEnd) await trigger(p, c, async () => { toZone(c, p.deck); chargeTop(p, 1); log(`${c.d.name} をデッキの下に置いた`); }, abilityText(c, /バトル終了時/));
    }
    // ③4.1. 『２回攻撃』『３回攻撃』：攻撃した後、1ターンに1回（2回）スタンドする
    let stood = false;
    for (const c of atk.filter(areaOf)) {
      const n = has(c, '3回攻撃') ? 2 : has(c, '2回攻撃') ? 1 : 0;
      if (c.rest && (c.tm.stood || 0) < n) { c.tm.stood = (c.tm.stood || 0) + 1; c.rest = false; stood = true; log(`${c.d.name} はスタンドした`); }
    }
    // ③4.3. プレイタイミング（スタンドしたカードがなければ、すぐ前のタイミングと同じなので省く）
    if (stood && !G.over) await counterTiming('スタンドの後');
  }
  // バトルの中身を1行で：攻撃しているカード（攻撃力・打撃力）→ 攻撃先
  function battleText() {
    const b = G.battle, live = b.atk.filter(areaOf), t = b.target;
    const pow = live.reduce((s, c) => s + val(c, 'pow'), 0), crit = live.reduce((s, c) => s + val(c, 'crit'), 0);
    const to = t === 'fighter' ? `${b.def.name}（ファイター）にダメージ${crit}` : areaOf(t) ? `${b.def.name}の${t.d.name}（防御力${num(val(t, 'def'))}）` : '（攻撃先なし）';
    return `${b.att.name}の${live.map(c => c.d.name).join('＋')}（攻撃力${num(pow)} 打撃力${crit}）→ ${to}`;
  }
  // バトル中の【対抗】のタイミング（詳細ルール ver.2.01 ③2.5.）。プレイタイミングなので、ターンファイター（攻撃側）から使うかを決め、
  // 使ったら相手がそれに返せる（respond）。攻撃側が使わなければ防御側、防御側が使ったら攻撃側が返せる。
  // 各ファイター1回まで。だれかが使ったら攻撃側から聞き直し、両方が続けて使わなかったら終わる
  async function counterWindow() {
    const b = G.battle;
    for (let again = true; again;) {
      again = false;
      for (const q of [b.att, b.def]) {
        if (b.used.has(q.i) || b.nullified || G.over) continue;
        const f = await askCounter(q, `対抗を使うかを決めよう！（バトル中：${battleText()}）`);
        if (f) { b.used.add(q.i); await f(); again = true; break; }
      }
    }
  }
  // 使用・コール・装備・能力を宣言したら（コストを払ったあと）、解決する前に相手が【対抗】を1回だけ使える
  // （詳細ルール ver.2.01 ①2. ②3./7. ⑤1.2./2.2.）。その【対抗】にさらに【対抗】は返せない（②Q２・Q３）。
  // バトルの【対抗】のタイミングの最中は、各ファイター1回まで（③2.5.）
  let answering = false;
  async function respond(p, what) {
    if (answering || G.over) return;
    const q = foe(p), b = G.battle && G.battle.window ? G.battle : null;
    if (b && b.used.has(q.i)) return;
    answering = true;
    try {
      const f = await askCounter(q, `対抗を使うかを決めよう！（${p.name}の${what}${b ? `。バトル中：${battleText()}` : ''}）`);
      if (f) { if (b) b.used.add(q.i); await f(); }
    } finally { answering = false; }
  }

  // ===== プレイヤーの操作 =====
  async function run(fn) {
    if (busy || G.over) return;
    busy = true;
    try { await fn(); check(); } finally { busy = false; onChange(); }
  }
  async function tapCard(p, c) {
    const a = me();
    if (p === a && a.hand.includes(c)) {
      if (G.phase === 'charge') {
        if (!await ask(p, 'チャージするかを決めよう！', [{label: 'チャージ', value: true}], true, c)) return;
        remove(p.hand, c); p.gauge.push(c); draw(p, 1);
        log(`${p.name}：チャージ＆ドロー`); fx('phase', PN.charge); await nextPhase(); return;
      }
      const o = handOptions(p, c);
      if (o.length) { const f = await ask(p, c.d.name, o, true, c); if (f) await f(); }
      return;
    }
    if (G.phase === 'main' && p === a && c.owner === p.i) {
        // 場のカードの【起動】。無ければ【対抗】【起動】（ドラゴナックルの攻撃力＋2000など）を、カードを押して使える
        const o = c.d.acts ? c.d.acts(p, c) : [], so = soulUseOptions(p, c);
        if (so.length) o.push(...so);
        // 忍び巻物などの「ソウルを見て使える」カードは、押したときにソウルの中身も帯に出す。
        // ソウルの《忍法》が【対抗】だけなら、メインでは使えないので、そのことも書いておく
        const soul = c.soul.length ? `（ソウル：${c.soul.map(x => x.d.name).join('、')}）` : '';
        const late = !so.length && c.d.soulUse && c.soul.some(x => x.d.counter && x.d.type === 'spell' && x.d.attr.includes(c.d.soulUse));
        if (o.length) {
          const f = await ask(p, `${c.d.name}${soul}${late ? `（${c.d.soulUse}は【対抗】のときに使える）` : ''}`, o, true, c);
          if (f) {
            const opt = o.find(x => x.value === f);
            if (opt && opt.soul) await f();
            else await trigger(p, c, f, (opt && opt.text) || abilityText(c, /【起動】/), 'の起動');
          }
          return;
        }
        if (c.d.fieldCounter && c.d.fieldCounter.can(p, c)) {
            const f = await ask(p, c.d.name, [{label: c.d.fieldCounter.label, value: true}], true, c);
            if (f) await useAbility(p, c, c.d.fieldCounter);
            return;
        }
        // 使える能力がないときも、ソウルの中身だけは押して確かめられるようにする
        if (c.soul.length) {
          await ask(p, `${c.d.name}${soul}${late ? `（${c.d.soulUse}は【対抗】のときに使える）` : ''}`, [], true, c);
          return;
        }
    } else if (G.phase === 'attack' && p === a && c.owner === p.i && areaOf(c) && areaOf(c) !== 'set') {
      // アタックフェイズ中にも使える【起動】（ディミオスソードの「破壊してスタンド」など）
      // レストしていないカード（ガイラムランスの「破壊して打撃力＋１」など）は、攻撃に使うか能力を使うかを聞く
      const canSelect = !c.rest && canAttack() && !(c.d.type === 'item' && a.field.center && !c.d.attackWithCenter);
      if (c.d.actInAttack && c.d.acts && !G.sel.includes(c) && (c.rest || !G.sel.length)) {
        const o = c.d.acts(p, c);
        if (o.length) {
          const opts = canSelect ? [{label: '攻撃に選ぶ', value: 'attack'}, ...o] : o;
          const f = await ask(p, c.d.name, opts, true, c);
          if (f === 'attack') {
            if (G.turnNo === 1) G.sel = [c]; else G.sel.push(c);
            return;
          }
          if (f) await trigger(p, c, f, (o.find(x => x.value === f) || {}).text || abilityText(c, /【起動】/), 'の起動');
          return;
        }
      }
      if (!canSelect) return;
      if (G.sel.includes(c)) remove(G.sel, c);
      else if (G.turnNo === 1) G.sel = [c];  // 先攻1ターン目は連携攻撃できない
      else G.sel.push(c);
    } else if (G.phase === 'attack' && p === a && c.owner !== p.i && G.sel.length && c.d.type === 'monster' && areaOf(c)) {
      if (G.sel.some(x => x.d.noSide) && (areaOf(c) === 'left' || areaOf(c) === 'right')) return;
      await attack([...G.sel], c);
    }
  }

  const findCard = uid => G.p.flatMap(p => [...p.hand, ...fieldCards(p)]).find(c => c.uid === uid);

  // 画面からの操作。pi はプレイヤー番号（0/1）
  function act(pi, a) {
    const p = G.p[pi];
    if (a.t === 'undo') { undo(pi); return; }
    const idle = !busy && !pending[0] && !pending[1] && G.phase !== 'deck' && a.t !== 'new' && a.t !== 'chat';
    if (idle) {
      lastIdle = {snap: snapshot(), acts: []};
      // 人が操作を始めた時点の盤面を残す。同じ盤面の複製を使い回す（loadState は複製して読み込む）
      if (pi !== botSeat && G.turn === pi) {
        undoStack.push({pi, snap: lastIdle.snap});
        if (undoStack.length > 40) undoStack.shift();  // 1ターンぶんも戻せれば十分（古いものから捨てる）
      }
    }
    if (lastIdle.snap && a.t !== 'new' && a.t !== 'chat')
      lastIdle.acts.push({pi, a: {...a}});
    if (a.t === 'answer') {
      const pr = pending[pi];
      if (pr && pr.id === a.id && pr.labels[a.i] !== undefined) { pending[pi] = null; pr.resolve(a.i); }
      return;
    }
    if (a.t === 'new') { newGame(); return; }
    // 決着のあとのあいさつ（3DS版と同じく、決まった言葉から選ぶ）
    if (a.t === 'chat' && G.over && GREETINGS[a.i]) { log(`${p.name}「${GREETINGS[a.i]}」`); fx('chat', GREETINGS[a.i], {by: p.name}); onChange(); return; }
    if (p !== me()) return;
    if (a.t === 'next') run(nextPhase);
    if (a.t === 'fighter' && G.phase === 'attack' && G.sel.length && !foe(p).field.center) run(() => attack([...G.sel], 'fighter'));
    if (a.t === 'card') { const c = findCard(a.uid); if (c) run(() => tapCard(p, c)); }
  }

  // ===== 画面に送る情報（相手の手札・山札の中身は送らない） =====
  // showSoul: 本人にだけ、ソウルの中身（「君はこのカードのソウルを見て」）を見せる
  function cardView(c, showSoul) {
    const d = c.d, soulViews = showSoul ? c.soul.map(x => cardView(x)) : null;
    return {uid: c.uid, id: d.id, name: d.name, type: d.type, counter: !!d.counter, size: d.size, attr: d.attr, text: d.text, cost: d.cost,
      pow: d.type === 'monster' || d.type === 'item' ? num(val(c, 'pow')) : null, crit: d.type === 'monster' || d.type === 'item' ? val(c, 'crit') : null,
      def: d.type === 'monster' ? val(c, 'def') : null, rest: c.rest, soul: c.soul.length, soulCards: soulViews && soulViews.map(x => x.name), soulViews, kw: kws(c),
      img: OFFICIAL_IMG(d.id), local: d.local ? `/cardImages/${d.local}.png` : null};
  }
  // 大会デッキのフラッグは、同じワールドのスタートデッキの画像を使う（ないワールドは文字で出す）
  const flagView = p => ({uid: null, id: p.flagSet ? `${p.flagSet}/0017` : null, name: p.flag, type: 'flag', counter: false, attr: [], kw: [], cost: {},
    text: [`■君は＜${p.flag}＞と＜ジェネリック＞のカードを使える。`], pow: null, crit: null, def: null, rest: false, soul: 0,
    img: p.flagSet ? OFFICIAL_IMG(`${p.flagSet}/0017`) : '', local: p.local ? `/cardImages/${p.local}.png` : null});
  // 攻撃中は、攻撃側の攻撃力・打撃力と、受ける側の防御力を向かい合わせて見せる
  function battleView() {
    const b = G.battle;
    if (!b) return null;
    const atk = b.atk.filter(areaOf), t = b.target === 'fighter' ? null : b.target;
    return {by: b.att.i, atk: atk.map(cardView), pow: num(atk.reduce((s, c) => s + val(c, 'pow'), 0)), crit: atk.reduce((s, c) => s + val(c, 'crit'), 0),
      target: t && areaOf(t) ? cardView(t) : null, fighter: b.target === 'fighter' ? b.def.name : null, def: t && areaOf(t) ? val(t, 'def') : null,
      nullified: b.nullified};
  }
  function view(pi) {
    const sideView = p => ({
      i: p.i, name: p.name, deckName: p.deckName, flag: p.flag, flagCard: flagView(p), life: p.life, deck: p.deck.length, gauge: p.gauge.length, handCount: p.hand.length,
      hand: p.i === pi ? p.hand.map(cardView) : null,
      drop: p.drop.map(cardView), buddy: cardView(p.buddy), buddyCalled: p.buddyCalled,
      // 場のカードのソウルは表向きなので、どちらのプレイヤーからも中身を見られる。
      // 設置カードのソウルは裏向きなので、持ち主にだけ見せる（忍び巻物など）
      field: Object.fromEntries(Object.entries(p.field).map(([a, c]) => [a, c && cardView(c, true)])),
      sets: p.sets.map(c => cardView(c, p.i === pi)),
    });
    const pr = pending[pi];
    // ファイターの名前は、プレイヤーには「自分」「相手」、観戦者には「P1」「P2」と見せる
    const nameOf = i => pi === 0 || pi === 1 ? (i === pi ? '自分' : '相手') : `P${i + 1}`;
    const v = {
      me: pi, turn: G.turn, turnNo: G.turnNo, phase: G.phase, over: G.over && G.over.i, sel: G.sel.map(c => c.uid),
      canAttack: canAttack(), canUndo: canUndo(pi), log: G.log.slice(0, 80), players: G.p.map(sideView),
      gaugePick: G.gaugePick && G.gaugePick.owner === pi ? G.gaugePick.cards.map(x => G.p[pi].gauge.indexOf(x)) : [],
      casting: G.casting.map(x => ({card: cardView(x.c), by: x.p.name, ability: !!x.ability, text: x.text || null})),
      battle: battleView(), fx: G.fx, greetings: GREETINGS,
      prompt: pr && {id: pr.id, title: pr.title, labels: pr.labels, targets: pr.targets, card: pr.card, gaugeCost: pr.gaugeCost || null},
      waiting: !pr && pending[1 - pi] ? '相手が操作をしているよ。' : null,
    };
    return JSON.parse(JSON.stringify(v).replace(/⟪P([01])⟫/g, (_, i) => nameOf(+i)));
  }

  // 両者のデッキに入っているカードの種類と効果（bot.js が対戦相手の AI に渡す。枚数と並びは渡さない）
  const deckInfo = () => G.p.map(p => ({name: p.deckName, flag: p.flag, buddy: p.buddy.d.name, cards: [...new Set([...p.ids, p.buddy.id])].map(id => D[id])}));

  // ===== 思考用：状態の複製と読み込み（tools/search.js が「この手を打ったら盤面がどうなるか」を見るのに使う） =====
  // カード定義 d はこのエンジンの D に付け替える（効果の関数がエンジンごとの G を握っているので、共有すると元の試合を書き換えてしまう）。
  // それ以外（盤面・手札・山札・ゲージ・バトル）は全て複製する
  function cloneState(x, seen = new Map()) {
    if (x === null || typeof x !== 'object') return x;
    if (seen.has(x)) return seen.get(x);
    if (x instanceof Set) {
      const s = new Set(); seen.set(x, s);
      for (const y of x) s.add(cloneState(y, seen));
      return s;
    }
    if (Array.isArray(x)) {
      const a = []; seen.set(x, a);
      for (const y of x) a.push(cloneState(y, seen));
      return a;
    }
    const o = {}; seen.set(x, o);
    for (const k of Object.keys(x)) {
      if (k === 'd') { o.d = (x.d && D[x.d.id]) || x.d; continue; }
      o[k] = cloneState(x[k], seen);
    }
    return o;
  }
  function snapshot() { return {G: cloneState(G), uid, promptSeq, fxSeq}; }
  function loadState(s) {
    G = cloneState(s.G);
    uid = s.uid; promptSeq = s.promptSeq || 0; fxSeq = s.fxSeq || 0;
    busy = false; answering = false;
    pending[0] = pending[1] = null;
    lastIdle = {snap: null, acts: []};
  }
  const resetIdle = () => { lastIdle = {snap: snapshot(), acts: []}; };

  // 「1手戻す」：自分が最後に操作を始めた時点の盤面に戻る（そのあいだの相手の応答も取り消す）。
  // 相手ターン中でも、盤面が止まっていて自分の前の手が残っていれば戻せる
  function canUndo(pi) {
    const top = undoStack[undoStack.length - 1];
    return !!top && top.pi === pi && G.over === null && !busy && !pending[0] && !pending[1];
  }
  function undo(pi) {
    if (!canUndo(pi)) return false;
    loadState(undoStack.pop().snap);
    log('── 1手戻した ──');
    onChange();
    return true;
  }

  if (state) loadState(state); else newGame();
  return {act, view, newGame, deckInfo, snapshot, loadState, undo, canUndo, getIdle: () => lastIdle, resetIdle, get G() { return G; }, get busy() { return busy; }, pending, _: {D, handOptions, counterOptions, canAttack, canUse, monsters, foe, fieldCards, me, destroy, leave, toZone, val, has, sizeOf, damage}};
}

module.exports = {createGame, DECKS, imgFile};
