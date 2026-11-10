// 「指摘」ボタンは、ふだんの対戦でも出る。押すと、その瞬間の盤面つきで GitHub の issue になる。
// コーチモード（?coach=1）のときだけ、相手の手札も表で見せる。
// 対戦中は止めない（直すのは次の試合から）。ただし、書いている間だけはボットの手を止める。
(() => {
    const isCoach = /[?&]coach=1/.test(location.search);
    // html にも付ける（盤面のカードの大きさは html の変数から決まるので、そこを上書きするため）
    if (isCoach) {
        document.body.classList.add('coach');
        document.documentElement.classList.add('coach');
    }

    const fab = document.createElement('button');
    fab.id = 'coach-fab';
    fab.type = 'button';
    fab.textContent = '指摘';
    fab.dataset.n = '0';

    const panel = document.createElement('div');
    panel.id = 'coach-panel';
    panel.hidden = true;
    panel.innerHTML = `
        <label for="coach-text">気づいたこと（一言）</label>
        <textarea id="coach-text" rows="2" placeholder="例: ここはセンターを空けずに攻撃してほしい"></textarea>
        <label for="coach-expect">どう動くと思ったか（任意）</label>
        <textarea id="coach-expect" rows="2" placeholder="例: ファイターに直接攻撃できるはず"></textarea>
        <label for="coach-kind">種類</label>
        <select id="coach-kind">
            <option value="rule">ルール（動きがおかしい）</option>
            <option value="play">打ち方（戦い方の指摘）</option>
        </select>
        <div class="row">
            <button type="button" class="primary" id="coach-send">送る</button>
            <button type="button" id="coach-close">閉じる</button>
        </div>
        <div class="note" id="coach-note"></div>`;
    document.body.append(fab, panel);

    // 広い画面では、頭・手札・質問・指摘を右の列にまとめる。
    // 盤面を左70%に詰めて縦を広く使えるようにするため（狭い画面は今まで通りの帯のまま）
    if (isCoach && matchMedia('(min-width: 1001px)').matches) {
        document.body.classList.add('coach-rail');
        document.documentElement.classList.add('coach-rail');
        const rail = document.createElement('aside');
        rail.id = 'coach-rail';
        // 並びは 頭 → 相手の手札 → 質問 → 指摘の入力欄 → 自分の手札。自分は列の一番下に付く
        for (const id of ['header-bar', 'opponent-hand', 'prompt-bar']) {
            const el = document.getElementById(id);
            if (el) rail.append(el);
        }
        rail.append(panel);
        const mine = document.getElementById('my-hand');
        if (mine) rail.append(mine);
        document.body.append(rail);
    }

    // ヘッダーの「メニュー」の隣に置く。ヘッダーは描き直すたびに中身が消えるので、消えたら入れ直す
    const mount = () => {
        const host = document.getElementById('buttons');
        if (host && !host.contains(fab)) host.append(fab);
    };
    const host = document.getElementById('buttons');
    if (host) new MutationObserver(mount).observe(host, {childList: true});
    mount();

    const $ = id => document.getElementById(id);
    const note = msg => { $('coach-note').textContent = msg; };
    let sent = 0;

    // 書いている間はボットの手を止める（止めないと盤面が変わり、パスや対抗の画面が入力欄の上に出る）。
    // 止めたまま試合が進まなくならないよう、サーバー側は期限つき。開いている間だけ延ばす
    const hold = sec => fetch('/coach/pause', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({sec}),
        keepalive: true,
    }).catch(() => {});
    let holdTimer = null;
    const setHold = on => {
        clearInterval(holdTimer);
        holdTimer = null;
        hold(on ? 300 : 0);
        if (on) holdTimer = setInterval(() => hold(300), 60 * 1000);
    };
    window.addEventListener('pagehide', () => hold(0));   // 画面を閉じたら動かし直す

    fab.onclick = () => {
        panel.hidden = !panel.hidden;
        if (!panel.hidden) {
            setHold(true);
            note('ボットの動きを止めています（閉じると再開）');
            $('coach-text').focus();
        } else {
            setHold(false);
        }
    };
    $('coach-close').onclick = () => { panel.hidden = true; setHold(false); };

    $('coach-send').onclick = async () => {
        const text = $('coach-text').value.trim();
        const expect = $('coach-expect').value.trim();
        if (!text && !expect) return note('一言を書いてください');
        const seat = (typeof S !== 'undefined' && S && (S.me === 0 || S.me === 1)) ? S.me : 0;
        note('送信中…');
        try {
            const res = await fetch('/coach/comment', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({seat, text, expect, kind: $('coach-kind').value}),
            });
            const out = await res.json();
            if (!res.ok) return note(out.error || '送れませんでした');
            $('coach-text').value = '';
            $('coach-expect').value = '';
            sent++;
            fab.dataset.n = String(sent);
            // 送れたら画面はすぐ閉じる。送った件数はボタンのバッジに出る
            panel.hidden = true;
            setHold(false);
        } catch (e) {
            note('送れませんでした: ' + e.message);
        }
    };

    // issue ができたら知らせる（作成はサーバーの裏で進む）
    if (typeof socket !== 'undefined' && socket && socket.on) {
        socket.on('coach-report', m => {
            if (m && m.issueUrl && !panel.hidden) note('issue を作りました: ' + m.issueUrl);
        });
    }

    // 送れたらパネルは自動で閉じる（送った件数はボタンのバッジに出る）
})();
