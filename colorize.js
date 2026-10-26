// OI Gold Pro: ระบายสีคำในแดชบอร์ดและผลวิเคราะห์สด (เฉพาะคำ/วลี ไม่ระบายทั้งประโยค)
// ขาลง / แบร์ / Put / ขาย / แท่งแดง = แดง · ขาขึ้น / บูล / Call / ซื้อ / แท่งเขียว = เขียว
// ชื่อเส้น (gmf itd, gmf M, Max Pain, VWAP, EM, Volume) = สีเดียวกับเส้นบนกราฟ · แนวรับเขียว แนวต้านแดง (รวมตัวเลขราคาที่ตามหลัง)
(function () {
  const RED = 'var(--put)', GRN = 'var(--call)';
  const NUM = '(?:\\s*(?:ที่|=|:)?\\s*[±$]?\\d[\\d,]*(?:\\.\\d+)?(?:\\s*[-–]\\s*\\d[\\d,]*(?:\\.\\d+)?)?)?';
  const E = s => `(?<![A-Za-z])(?:${s})(?![A-Za-z])`; // คำอังกฤษต้องเป็นคำเต็ม
  // ลำดับสำคัญ: วลียาวมาก่อน เพื่อไม่ให้ถูกตัดเป็นคำสั้น
  const RULES = [
    // ---- เส้นบนกราฟ (สีตามเส้น) ----
    [E('[Vv]olume [Cc]all|[Vv]ol [Cc]all') + NUM, 'var(--volc)'],
    [E('[Vv]olume [Pp]ut|[Vv]ol [Pp]ut') + NUM, 'var(--volp)'],
    [E('gmf ?itd|GMF ?ITD|[Gg]amma [Ff]lip (?:itd|ITD|วันนี้)') + NUM, 'var(--gmfi)'],
    [E('gmf ?M|GMF ?M|[Gg]amma [Ff]lip (?:M|เดือน)') + NUM, 'var(--gmfm)'],
    [E('gmf|GMF|[Gg]amma [Ff]lip') + NUM, 'var(--gmfi)'],
    [E('[Mm]ax [Pp]ain|MP') + NUM, 'var(--mp)'],
    [E('VWAP|vwap') + NUM, '#f2f2f2'],
    [E('[Ee]xpected [Mm]ove|EM') + NUM, '#9aa7ff'],
    [E('[Vv]olume|[Vv]ol') + '|วอลลุ่ม|วอลุ่ม|โวลุ่ม|วอลุม', '#ffd60a'],
    // ---- แนวรับ / แนวต้าน ----
    ['แนวต้าน' + NUM + '|' + E('[Rr]esistance|[Cc]all [Ww]all') + NUM, RED],
    ['แนวรับ' + NUM + '|' + E('[Ss]upport|[Pp]ut [Ww]all') + NUM, GRN],
    // ---- แท่งเทียน ----
    ['แท่ง(?:เทียน)?(?:สี)?แดง|แท่ง(?:เทียน)?ขาลง|แท่งลง', RED],
    ['แท่ง(?:เทียน)?(?:สี)?เขียว|แท่ง(?:เทียน)?ขาขึ้น|แท่งขึ้น', GRN],
    // ---- ฝั่งลง (แดง) ----
    [E('[Bb]earish(?: [A-Z][a-z]+)*|BEARISH|[Ss]hooting [Ss]tar|[Ee]vening [Ss]tar|[Dd]ouble [Tt]op|[Ll]ower [Ll]ow|[Ll]ower [Hh]igh|LL|LH|[Ss]ell|SELL|[Ss]hort|SHORT|[Pp]ut|PUT|[Pp]uts|[Dd]owntrend|[Bb]reakdown'), RED],
    ['แบร์ลิช|แบร์ริช|แบรลิช|แบร์|กลัวขาลง|ขาลง|ลงต่อ|ปรับลง|ปรับฐาน|ร่วงลง|ร่วง|ดิ่งลง|ดิ่ง|ไหลลง|ทรุด|ทิ้งตัว|ลงแรง|เร่งลง|ทะลุลง|เบรกลง|หลุดลง|หลุดแนว|หลุด|กดดันลง|กดลง|ถูกกด|เด้งลง|ย่อลง|ปิดต่ำกว่า|แรงขาย|ฝั่งขาย|เทขาย|ไล่ขาย|เข้าขาย|ชอร์ต|ขาย|พุท|พุต', RED],
    // ---- ฝั่งขึ้น (เขียว) ----
    [E('[Bb]ullish(?: [A-Z][a-z]+)*|BULLISH|[Hh]ammer|[Mm]orning [Ss]tar|[Dd]ouble [Bb]ottom|[Hh]igher [Hh]igh|[Hh]igher [Ll]ow|HH|HL|[Bb]uy|BUY|[Ll]ong|LONG|[Cc]all|CALL|[Cc]alls|[Uu]ptrend|[Bb]reakout'), GRN],
    ['บูลลิช|บูลิช|บลูลิช|บูล|ไล่ซื้อขาขึ้น|ขาขึ้น|ขึ้นต่อ|ปรับขึ้น|พุ่งขึ้น|พุ่ง|ดีดขึ้น|ดีดตัว|เด้งขึ้น|ทะลุขึ้น|เบรกขึ้น|ยืนเหนือ|ปิดเหนือ|หนุนขึ้น|ฟื้นตัว|รีบาวด์|แรงซื้อ|ฝั่งซื้อ|ไล่ซื้อ|เข้าซื้อ|รับซื้อ|ซื้อ|คอล', GRN],
  ];
  const RE = new RegExp(RULES.map(r => `(${r[0]})`).join('|'), 'g');
  const SKIP = new Set(['SCRIPT', 'STYLE', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'A', 'CANVAS', 'svg', 'SVG']);

  function paint(node) {
    const txt = node.nodeValue;
    RE.lastIndex = 0;
    if (!RE.test(txt)) return;
    RE.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0, m;
    while ((m = RE.exec(txt))) {
      if (!m[0]) { RE.lastIndex++; continue; }
      let gi = 1; while (gi < m.length && m[gi] === undefined) gi++;
      if (m.index > last) frag.appendChild(document.createTextNode(txt.slice(last, m.index)));
      const s = document.createElement('span');
      s.className = 'kc'; s.style.color = RULES[gi - 1][1]; s.textContent = m[0];
      frag.appendChild(s);
      last = m.index + m[0].length;
    }
    if (last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }

  window.OIColorize = function (root) {
    if (!root) return;
    const nodes = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        for (let p = n.parentNode; p && p !== root; p = p.parentNode) {
          if (SKIP.has(p.nodeName) || p.namespaceURI === 'http://www.w3.org/2000/svg' || (p.classList && (p.classList.contains('kc') || p.classList.contains('nc') || p.classList.contains('badge') || p.classList.contains('im') || p.classList.contains('tg')))) return NodeFilter.FILTER_REJECT;
        }
        return n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(paint);
  };
})();
