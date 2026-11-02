(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const modal = $("#modal"), modalContent = $("#modal-content");
  const STORAGE = {
    drafts: "smarttools_v2_drafts",
    notes: "smarttools_v2_notes",
    hashtags: "smarttools_v2_hashtags",
    schedule: "smarttools_v2_schedule"
  };
  let activeTool = null;
  let focusTimer = null, focusRemaining = 25 * 60, focusInitial = 25 * 60;
  let stopwatchTimer = null, stopwatchStart = 0, stopwatchElapsed = 0;
  let adsControllerPromise = null, lastAdRequest = 0;
  let telegramBackHandler = null;

  const escapeHTML = value => String(value).replace(/[&<>"']/g, ch => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  })[ch]);
  const readStore = key => {
    try { const value = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(value) ? value : []; }
    catch (error) { console.warn("Local storage read failed:", key, error); return []; }
  };
  const writeStore = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (error) { console.warn("Local storage write failed:", key, error); toast("Could not save. Device storage may be full."); return false; }
  };
  let toastTimeout;
  function toast(message) {
    const node = $("#toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => node.classList.remove("show"), 2300);
  }
  function updateDashboard() {
    $("#draft-count").textContent = readStore(STORAGE.drafts).length;
    const today = new Date().toISOString().slice(0, 10);
    $("#schedule-count").textContent = readStore(STORAGE.schedule).filter(item => item.date >= today && !item.done).length;
  }
  function stopClocks() {
    if (focusTimer) { clearInterval(focusTimer); focusTimer = null; }
    if (stopwatchTimer) { clearInterval(stopwatchTimer); stopwatchTimer = null; }
  }
  function openModal(title, kicker, markup) {
    stopClocks();
    activeTool = title;
    $("#modal-title").textContent = title;
    $("#modal-kicker").textContent = kicker;
    modalContent.innerHTML = markup;
    modal.hidden = false;
    const tg = window.Telegram?.WebApp;
    if (tg?.BackButton?.show) {
      try {
        telegramBackHandler = () => closeModal();
        tg.BackButton.onClick(telegramBackHandler);
        tg.BackButton.show();
      } catch (error) { console.warn("Telegram BackButton unavailable:", error); }
    }
    $("#close-modal").focus();
  }
  function closeModal() {
    modal.hidden = true;
    stopClocks();
    const tg = window.Telegram?.WebApp;
    if (tg?.BackButton?.hide) {
      try {
        if (telegramBackHandler) tg.BackButton.offClick(telegramBackHandler);
        tg.BackButton.hide();
      } catch (error) { console.warn("Telegram BackButton cleanup:", error); }
    }
    telegramBackHandler = null;
    activeTool = null;
  }
  $("#close-modal").addEventListener("click", closeModal);
  modal.addEventListener("click", event => { if (event.target === modal) closeModal(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !modal.hidden) closeModal(); });

  async function copyText(value, success = "Copied") {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else {
        const area = document.createElement("textarea");
        area.value = value; area.style.position = "fixed"; area.style.opacity = "0";
        document.body.appendChild(area); area.select();
        const ok = document.execCommand("copy"); area.remove();
        if (!ok) throw new Error("Clipboard copy failed");
      }
      toast(success);
    } catch (error) { console.warn("Clipboard unavailable:", error); toast("Copy unavailable in this browser"); }
  }
  function bind(id, event, handler) {
    const node = $("#" + id);
    if (node) node.addEventListener(event, handler);
    return node;
  }
  function formatDate(date) {
    if (!date) return "";
    const parsed = new Date(date + "T00:00:00");
    return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString(undefined, { day:"numeric", month:"short", year:"numeric" });
  }
  function postPreviewText(raw) {
    let text = escapeHTML(raw);
    text = text.replace(/\*\*(.+?)\*\*/gs, "<strong>$1</strong>")
      .replace(/_(.+?)_/gs, "<em>$1</em>")
      .replace(/`(.+?)`/gs, "<code>$1</code>")
      .replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
    return text;
  }

  const tools = {
    composer() {
      const drafts = readStore(STORAGE.drafts);
      openModal("Post Composer", "WRITE • FORMAT • PREVIEW", `
        <label class="field-label" for="post-title">Draft title</label>
        <input class="field" id="post-title" maxlength="90" placeholder="e.g. Weekly channel update">
        <label class="field-label" for="post-body">Post content</label>
        <textarea class="field textarea" id="post-body" placeholder="Start writing your Telegram post...&#10;&#10;Use **bold**, _italic_, \`code\` or start a line with > for a quote."></textarea>
        <div class="action-row">
          <button class="small-button" data-insert="**bold text**">Bold</button>
          <button class="small-button" data-insert="_italic text_">Italic</button>
          <button class="small-button" data-insert="\`code\`">Code</button>
          <button class="small-button" data-insert="> quote">Quote</button>
          <button class="small-button" id="copy-post">Copy post</button>
        </div>
        <div class="metric-row"><div class="metric"><strong id="post-chars">0</strong><small>CHARACTERS</small></div><div class="metric"><strong id="post-words">0</strong><small>WORDS</small></div><div class="metric"><strong id="post-lines">0</strong><small>LINES</small></div></div>
        <div class="preview-card"><div class="preview-label">TELEGRAM-STYLE PREVIEW</div><div class="post-preview" id="post-preview">Your post preview will appear here.</div></div>
        <div class="action-row"><button class="small-button primary" id="save-draft">Save draft</button><button class="small-button" id="clear-post">Clear</button></div>
        <div class="item-list" id="draft-list">${drafts.length ? drafts.slice(0,6).map(d=>`<div class="list-item"><div><strong>${escapeHTML(d.title || "Untitled draft")}</strong><small>${formatDate(d.updatedAt.slice(0,10))} · ${d.body.length} characters</small></div><div class="list-actions"><button data-load-draft="${d.id}">Open</button><button data-delete-draft="${d.id}">Delete</button></div></div>`).join("") : '<p class="helper">Your saved drafts will appear here.</p>'}</div>`);
      const body = $("#post-body"), title = $("#post-title");
      function updatePreview() {
        const value = body.value;
        $("#post-chars").textContent = value.length;
        $("#post-words").textContent = (value.trim().match(/\S+/g) || []).length;
        $("#post-lines").textContent = value ? value.split(/\r\n|\r|\n/).length : 0;
        $("#post-preview").innerHTML = value ? postPreviewText(value) : "Your post preview will appear here.";
      }
      body.addEventListener("input", updatePreview);
      $$("[data-insert]", modalContent).forEach(button => button.addEventListener("click", () => {
        const snippet = button.dataset.insert, start = body.selectionStart, end = body.selectionEnd;
        body.setRangeText(snippet, start, end, "end"); body.focus(); updatePreview();
      }));
      bind("copy-post", "click", () => copyText(body.value, "Post copied"));
      bind("clear-post", "click", () => { title.value = ""; body.value = ""; updatePreview(); });
      bind("save-draft", "click", () => {
        if (!body.value.trim()) return toast("Write some content before saving");
        const list = readStore(STORAGE.drafts);
        list.unshift({ id: Date.now(), title: title.value.trim() || "Untitled draft", body: body.value, updatedAt: new Date().toISOString() });
        if (writeStore(STORAGE.drafts, list.slice(0, 100))) { toast("Draft saved on this device"); updateDashboard(); tools.composer(); }
      });
      $$("[data-load-draft]", modalContent).forEach(button => button.addEventListener("click", () => {
        const item = readStore(STORAGE.drafts).find(d => d.id === Number(button.dataset.loadDraft));
        if (item) { title.value = item.title; body.value = item.body; updatePreview(); body.focus(); }
      }));
      $$("[data-delete-draft]", modalContent).forEach(button => button.addEventListener("click", () => {
        writeStore(STORAGE.drafts, readStore(STORAGE.drafts).filter(d => d.id !== Number(button.dataset.deleteDraft)));
        toast("Draft deleted"); updateDashboard(); tools.composer();
      }));
    },

    counter() {
      openModal("Caption Check", "WRITE • MEASURE • REFINE", `
        <label class="field-label" for="counter-input">Paste or type your text</label>
        <textarea class="field textarea" id="counter-input" placeholder="Your caption or message..."></textarea>
        <div class="metric-row"><div class="metric"><strong id="c-words">0</strong><small>WORDS</small></div><div class="metric"><strong id="c-chars">0</strong><small>CHARACTERS</small></div><div class="metric"><strong id="c-no-space">0</strong><small>NO SPACES</small></div></div>
        <div class="action-row"><button class="small-button" data-clean="trim">Trim edges</button><button class="small-button" data-clean="spaces">Fix spacing</button><button class="small-button" data-clean="lines">Remove blank lines</button><button class="small-button" id="counter-copy">Copy text</button></div>
        <p class="helper">Counts update as you type. Text is processed in your browser and is not uploaded.</p>`);
      const input = $("#counter-input");
      function update() { const v=input.value; $("#c-words").textContent=(v.trim().match(/\S+/g)||[]).length; $("#c-chars").textContent=v.length; $("#c-no-space").textContent=v.replace(/\s/g,"").length; }
      input.addEventListener("input",update);
      $$("[data-clean]",modalContent).forEach(b=>b.addEventListener("click",()=>{let v=input.value; if(b.dataset.clean==="trim")v=v.trim();if(b.dataset.clean==="spaces")v=v.replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n").trim();if(b.dataset.clean==="lines")v=v.split(/\r?\n/).filter(line=>line.trim()).join("\n");input.value=v;update();}));
      bind("counter-copy","click",()=>copyText(input.value,"Text copied"));
    },

    hashtags() {
      function render() {
        const tags = readStore(STORAGE.hashtags);
        openModal("Hashtag Library", "WRITE • COLLECT • REUSE", `
          <label class="field-label" for="tag-group">Group name</label><input class="field" id="tag-group" placeholder="e.g. Design, Updates, Tutorials">
          <label class="field-label" for="tag-input">Hashtags</label><textarea class="field" id="tag-input" rows="3" placeholder="#design #telegram #updates"></textarea>
          <div class="action-row"><button class="small-button primary" id="save-tags">Save hashtag group</button></div>
          <div class="item-list">${tags.length ? tags.map(t=>`<div class="list-item"><div><strong>${escapeHTML(t.name)}</strong><small>${t.tags.map(escapeHTML).join(" ")}</small></div><div class="list-actions"><button data-copy-tags="${t.id}">Copy</button><button data-remove-tags="${t.id}">Delete</button></div></div>`).join("") : '<p class="helper">No groups yet. Save a few tags you use often.</p>'}</div>`);
        bind("save-tags","click",()=>{const name=$("#tag-group").value.trim(), raw=$("#tag-input").value;const clean=[...new Set((raw.match(/#[\p{L}\p{N}_]+/gu)||[]).map(x=>x.toLowerCase()))];if(!name||!clean.length)return toast("Add a group name and at least one #hashtag");const next=readStore(STORAGE.hashtags);next.unshift({id:Date.now(),name,tags:clean});if(writeStore(STORAGE.hashtags,next)) {toast("Hashtag group saved");render();}});
        $$("[data-copy-tags]",modalContent).forEach(b=>b.addEventListener("click",()=>{const t=readStore(STORAGE.hashtags).find(x=>x.id===Number(b.dataset.copyTags));if(t)copyText(t.tags.join(" "),"Hashtags copied");}));
        $$("[data-remove-tags]",modalContent).forEach(b=>b.addEventListener("click",()=>{writeStore(STORAGE.hashtags,readStore(STORAGE.hashtags).filter(x=>x.id!==Number(b.dataset.removeTags)));render();toast("Group removed");}));
      } render();
    },

    planner() {
      function render() {
        const items = readStore(STORAGE.schedule).sort((a,b)=>a.date.localeCompare(b.date));
        openModal("Content Planner", "ORGANIZE • PLAN • PUBLISH", `
          <div class="field-row"><div><label class="field-label" for="plan-date">Publish date</label><input class="field" id="plan-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div><div><label class="field-label" for="plan-time">Time (optional)</label><input class="field" id="plan-time" type="time"></div></div>
          <label class="field-label" for="plan-title">Post idea or title</label><input class="field" id="plan-title" class="field" maxlength="100" placeholder="What are you planning to publish?">
          <label class="field-label" for="plan-channel">Channel / category (optional)</label><input class="field" id="plan-channel" placeholder="e.g. Main channel">
          <div class="action-row"><button class="small-button primary" id="add-plan">Add to planner</button></div>
          <div class="item-list">${items.length ? items.map(p=>`<div class="list-item"><div><strong>${escapeHTML(p.title)}</strong><small>${formatDate(p.date)}${p.time?" · "+escapeHTML(p.time):""}${p.channel?" · "+escapeHTML(p.channel):""}</small></div><div class="list-actions"><button data-done-plan="${p.id}">${p.done?"Undo":"Done"}</button><button data-del-plan="${p.id}">Delete</button></div></div>`).join("") : '<p class="helper">Your publishing plan is empty. Add your next post idea above.</p>'}</div>`);
        bind("add-plan","click",()=>{const date=$("#plan-date").value,title=$("#plan-title").value.trim();if(!date||!title)return toast("Choose a date and add a post title");const list=readStore(STORAGE.schedule);list.push({id:Date.now(),date,time:$("#plan-time").value,title,channel:$("#plan-channel").value.trim(),done:false});if(writeStore(STORAGE.schedule,list)){updateDashboard();toast("Added to your planner");render();}});
        $$("[data-del-plan]",modalContent).forEach(b=>b.addEventListener("click",()=>{writeStore(STORAGE.schedule,readStore(STORAGE.schedule).filter(p=>p.id!==Number(b.dataset.delPlan)));updateDashboard();render();}));
        $$("[data-done-plan]",modalContent).forEach(b=>b.addEventListener("click",()=>{const list=readStore(STORAGE.schedule).map(p=>p.id===Number(b.dataset.donePlan)?{...p,done:!p.done}:p);writeStore(STORAGE.schedule,list);render();}));
      } render();
    },

    notes() {
      function render() {
        const notes=readStore(STORAGE.notes);
        openModal("Idea Notes", "ORGANIZE • CAPTURE • RETURN", `
          <label class="field-label" for="note-title">Note title</label><input class="field" id="note-title" maxlength="80" placeholder="Give this idea a name">
          <label class="field-label" for="note-body">Your note</label><textarea class="field textarea" id="note-body" placeholder="Capture a thought, outline or reminder..."></textarea>
          <div class="action-row"><button class="small-button primary" id="save-note">Save note</button><button class="small-button" id="cancel-note-edit" hidden>Cancel edit</button></div>
          <div class="item-list">${notes.length?notes.map(n=>`<div class="list-item"><div><strong>${escapeHTML(n.title)}</strong><small>${escapeHTML(n.body.slice(0,95))}${n.body.length>95?"…":""}</small></div><div class="list-actions"><button data-edit-note="${n.id}">Edit</button><button data-del-note="${n.id}">Delete</button></div></div>`).join(""):'<p class="helper">No notes saved yet.</p>'}</div>`);
        let editingId = null;
        const saveButton = $("#save-note");
        const cancelButton = $("#cancel-note-edit");
        function resetEditor() {
          editingId = null;
          $("#note-title").value = "";
          $("#note-body").value = "";
          saveButton.textContent = "Save note";
          cancelButton.hidden = true;
        }
        saveButton.addEventListener("click",()=>{
          const title=$("#note-title").value.trim(),body=$("#note-body").value.trim();
          if(!title||!body)return toast("Add a title and some note text");
          const list=readStore(STORAGE.notes);
          if(editingId !== null) {
            const next=list.map(x=>x.id===editingId?{...x,title,body,updatedAt:new Date().toISOString()}:x);
            if(writeStore(STORAGE.notes,next)){toast("Note updated");render();}
          } else {
            list.unshift({id:Date.now(),title,body,updatedAt:new Date().toISOString()});
            if(writeStore(STORAGE.notes,list)){toast("Note saved");render();}
          }
        });
        cancelButton.addEventListener("click",resetEditor);
        $$("[data-edit-note]",modalContent).forEach(b=>b.addEventListener("click",()=>{
          const n=readStore(STORAGE.notes).find(x=>x.id===Number(b.dataset.editNote));
          if(n){editingId=n.id;$("#note-title").value=n.title;$("#note-body").value=n.body;saveButton.textContent="Update note";cancelButton.hidden=false;$("#note-title").focus();}
        }));
        $$("[data-del-note]",modalContent).forEach(b=>b.addEventListener("click",()=>{
          writeStore(STORAGE.notes,readStore(STORAGE.notes).filter(n=>n.id!==Number(b.dataset.delNote)));
          render();toast("Note deleted");
        }));
      } render();
    },

    links() {
      openModal("Campaign Link Builder", "UTILITY • BUILD TRACKABLE LINKS", `
        <label class="field-label" for="base-url">Destination URL</label><input class="field" id="base-url" type="url" placeholder="https://example.com/page">
        <div class="field-row"><div><label class="field-label" for="utm-source">Source</label><input class="field" id="utm-source" placeholder="telegram"></div><div><label class="field-label" for="utm-medium">Medium</label><input class="field" id="utm-medium" placeholder="social"></div></div>
        <div class="field-row"><div><label class="field-label" for="utm-campaign">Campaign</label><input class="field" id="utm-campaign" placeholder="november_launch"></div><div><label class="field-label" for="utm-content">Content (optional)</label><input class="field" id="utm-content" placeholder="post_a"></div></div>
        <div class="action-row"><button class="small-button primary" id="build-link">Build campaign URL</button></div>
        <div class="result-card" id="link-result" hidden><div class="preview-label">YOUR TRACKING LINK</div><div id="built-url" class="post-preview" style="overflow-wrap:anywhere"></div><div class="action-row"><button class="small-button" id="copy-link">Copy URL</button></div></div>
        <p class="helper">UTM parameters help analytics tools identify where visits came from. They do not guarantee tracking unless your destination analytics is configured.</p>`);
      bind("build-link","click",()=>{try{const url=new URL($("#base-url").value.trim());if(!["http:","https:"].includes(url.protocol))throw new Error("Use an http or https URL");const params={utm_source:$("#utm-source").value.trim(),utm_medium:$("#utm-medium").value.trim(),utm_campaign:$("#utm-campaign").value.trim(),utm_content:$("#utm-content").value.trim()};Object.entries(params).forEach(([k,v])=>{if(v)url.searchParams.set(k,v);});$("#built-url").textContent=url.toString();$("#link-result").hidden=false;}catch(e){toast("Enter a valid http or https destination URL");}});
      bind("copy-link","click",()=>copyText($("#built-url").textContent,"Campaign URL copied"));
    },

    qr() {
      openModal("QR Studio", "UTILITY • GENERATE • DOWNLOAD", `
        <label class="field-label" for="qr-value">Website URL or short text</label><textarea class="field" id="qr-value" rows="3" placeholder="https://yourwebsite.com"></textarea>
        <div class="action-row"><button class="small-button primary" id="generate-qr">Generate QR code</button><button class="small-button" id="download-qr">Download PNG</button></div>
        <div class="qr-output" id="qr-output"><span style="color:#52604f;font-size:11px">Your QR code will appear here</span></div>
        <p class="helper">QR creation runs in your browser using a library loaded from cdnjs. Avoid putting private or sensitive information in a QR code.</p>`);
      bind("generate-qr","click",()=>{const value=$("#qr-value").value.trim();if(!value)return toast("Enter a URL or text first");if(!window.QRCode)return toast("QR library did not load. Check your connection and try again.");const output=$("#qr-output");output.innerHTML="";try{new QRCode(output,{text:value,width:190,height:190,colorDark:"#142017",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.M});}catch(e){console.error(e);toast("Could not generate this QR code");}});
      bind("download-qr","click",()=>{const output=$("#qr-output"),canvas=$("canvas",output),img=$("img",output);const data=canvas?canvas.toDataURL("image/png"):img?.src;if(!data)return toast("Generate a QR code first");const a=document.createElement("a");a.href=data;a.download="smarttools-qr.png";document.body.appendChild(a);a.click();a.remove();});
    },

    focus() {
      openModal("Focus Room", "ORGANIZE • MAKE SPACE FOR FOCUS", `
        <div class="field-row"><div><label class="field-label" for="focus-minutes">Session length</label><select class="field" id="focus-minutes"><option value="15">15 minutes</option><option value="25" selected>25 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></div><div><label class="field-label">Mode</label><div class="field" style="color:#b8d777">Focus session</div></div></div>
        <div class="clock-display" id="focus-display">25:00</div>
        <div class="action-row" style="justify-content:center"><button class="small-button primary" id="focus-start">Start focus</button><button class="small-button" id="focus-reset">Reset</button></div>
        <p class="helper" style="text-align:center">Keep this screen open while you work. The timer runs in this Mini App session.</p>`);
      const display=$("#focus-display"), start=$("#focus-start"), select=$("#focus-minutes");
      const fmt=n=>`${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;
      focusInitial=Number(select.value)*60;focusRemaining=focusInitial;
      select.addEventListener("change",()=>{if(focusTimer)return;focusInitial=Number(select.value)*60;focusRemaining=focusInitial;display.textContent=fmt(focusRemaining);});
      start.addEventListener("click",()=>{if(focusTimer){clearInterval(focusTimer);focusTimer=null;start.textContent="Resume";return;}start.textContent="Pause";focusTimer=setInterval(()=>{focusRemaining=Math.max(0,focusRemaining-1);display.textContent=fmt(focusRemaining);if(focusRemaining===0){clearInterval(focusTimer);focusTimer=null;start.textContent="Start focus";toast("Focus session complete");try{window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");}catch{}}},1000);});
      bind("focus-reset","click",()=>{if(focusTimer)clearInterval(focusTimer);focusTimer=null;focusInitial=Number(select.value)*60;focusRemaining=focusInitial;display.textContent=fmt(focusRemaining);start.textContent="Start focus";});
    },

    convert() {
      openModal("Unit Converter", "UTILITY • QUICK CONVERSIONS", `
        <label class="field-label" for="unit-type">Conversion type</label><select class="field" id="unit-type"><option value="length">Length</option><option value="weight">Weight</option><option value="temperature">Temperature</option></select>
        <label class="field-label" for="unit-value">Value</label><input class="field" id="unit-value" type="number" step="any" value="1">
        <div class="field-row"><div><label class="field-label" for="unit-from">From</label><select class="field" id="unit-from"></select></div><div><label class="field-label" for="unit-to">To</label><select class="field" id="unit-to"></select></div></div>
        <div class="result-card" id="unit-result" aria-live="polite">1 km = 1000 m</div>`);
      const data={length:{km:1000,m:1,cm:.01,mm:.001,mi:1609.344,ft:.3048,in:.0254},weight:{kg:1000,g:1,mg:.001,lb:453.59237,oz:28.349523125}};
      const type=$("#unit-type"),from=$("#unit-from"),to=$("#unit-to"),value=$("#unit-value");
      function fill(){const opts=type.value==="temperature"?["°C","°F","K"]:Object.keys(data[type.value]);from.innerHTML=opts.map(x=>`<option value="${x}">${x}</option>`).join("");to.innerHTML=opts.map(x=>`<option value="${x}">${x}</option>`).join("");to.selectedIndex=1;calculate();}
      function calculate(){const n=Number(value.value),a=from.value,b=to.value;if(!Number.isFinite(n)){ $("#unit-result").textContent="Enter a valid number.";return;}let result=n;if(type.value==="temperature"){const c=a==="°C"?n:a==="°F"?(n-32)*5/9:n-273.15;result=b==="°C"?c:b==="°F"?c*9/5+32:c+273.15;}else result=n*data[type.value][a]/data[type.value][b];$("#unit-result").textContent=`${n} ${a} = ${Number(result.toPrecision(9))} ${b}`;}
      type.addEventListener("change",fill);[from,to,value].forEach(el=>el.addEventListener("input",calculate));fill();
    }
  };

  $$("[data-open]").forEach(button=>button.addEventListener("click",()=>{const tool=button.dataset.open;if(tools[tool])tools[tool]();}));
  $$("[data-page]").forEach(button=>button.addEventListener("click",()=>showInfoPage(button.dataset.page)));
  $("#profile-button").addEventListener("click",()=>showInfoPage("about"));

  function showInfoPage(page) {
    const pages={
      about:`<div class="policy-copy"><p><strong>SmartTools Pro</strong> is a creator workspace for drafting, organizing and preparing content. It is designed around practical workflows rather than ad-gated tasks.</p><h3>What is included</h3><p>Post Composer, Caption Check, Hashtag Library, Content Planner, Idea Notes, Campaign Link Builder, QR Studio, Focus Room and Unit Converter.</p><h3>How data is stored</h3><p>Your drafts, notes, tags and plan are saved locally in this browser or Telegram WebView storage. There is no cloud sync or account system in this starter.</p></div>`,
      privacy:`<div class="policy-copy"><p><strong>Last updated: 3 November 2026</strong></p><h3>Local content</h3><p>Drafts, notes, hashtag groups and planner entries are stored in local browser storage on your device. They are not sent to this app's server. Clearing Telegram or browser site data may remove them.</p><h3>Telegram</h3><p>When opened in Telegram, the Mini App SDK provides platform context. This version does not send Telegram profile information to a backend and does not use unvalidated Telegram launch data for server-side identity or authorization.</p><h3>Optional advertising</h3><p>If you choose to request an ad, the AdsGram SDK and its providers may process technical data needed to serve and measure that ad. Ad availability depends on the provider. Core tools remain usable if no ad is available or you choose not to request one.</p><h3>Third-party libraries</h3><p>The QR generator library is loaded from cdnjs. When used, QR content is processed in the browser by that library. Do not encode confidential information.</p><h3>Contact</h3><p>Publisher contact: replace this paragraph with a real email address or support link controlled by the publisher before public launch.</p></div>`,
      terms:`<div class="policy-copy"><p><strong>Last updated: 3 November 2026</strong></p><h3>General use</h3><p>The tools are provided for convenience. Verify important calculations and campaign analytics independently before relying on them for business-critical decisions.</p><h3>Availability</h3><p>We aim to keep the workspace available but do not guarantee uninterrupted service. Some third-party services require an internet connection.</p><h3>Advertising</h3><p>Ads are optional. No core feature is locked behind an ad, and users are never asked to click an advertisement. Ad availability is controlled by the provider.</p><h3>Acceptable use</h3><p>Do not use the app for unlawful, abusive or infringing purposes.</p><h3>Publisher details</h3><p>Add your real publisher name and contact details before submitting this app for moderation.</p></div>`,
      support:`<div class="policy-copy"><p>For support, replace this placeholder with a contact method that you actively monitor.</p><p><strong>Before publishing:</strong> add a valid email address or Telegram support link in this section and in the published privacy policy.</p></div>`
    };
    const title=page==="about"?"About":page==="privacy"?"Privacy":page==="terms"?"Terms":"Support";
    openModal(title,"SMARTTOOLS PRO • INFORMATION",pages[page]||pages.about);
  }

  // AdsGram is initialized only after a deliberate user click. No ad is requested on page load.
  function loadAdsgram() {
    if (window.Adsgram?.init) return Promise.resolve(window.Adsgram);
    if (adsControllerPromise) return adsControllerPromise;
    adsControllerPromise = new Promise((resolve,reject)=>{
      let script=document.querySelector('script[data-adsgram-sdk="true"]');
      if(!script){
        script=document.createElement("script");
        script.src=window.APP_CONFIG?.adsgramScriptUrl||"https://sad.adsgram.ai/js/sad.min.js";
        script.async=true;script.dataset.adsgramSdk="true";
        document.head.appendChild(script);
      }
      const timeout=setTimeout(()=>reject(new Error("AdsGram SDK load timed out")),10000);
      script.addEventListener("load",()=>{clearTimeout(timeout);if(window.Adsgram?.init)resolve(window.Adsgram);else reject(new Error("AdsGram SDK did not expose its API"));},{once:true});
      script.addEventListener("error",()=>{clearTimeout(timeout);reject(new Error("AdsGram SDK failed to load"));},{once:true});
      if(window.Adsgram){clearTimeout(timeout);resolve(window.Adsgram);}
    }).catch(error=>{adsControllerPromise=null;throw error;});
    return adsControllerPromise;
  }
  $("#show-ad").addEventListener("click",async()=>{
    const status=$("#ad-status"),button=$("#show-ad"),blockId=String(window.APP_CONFIG?.adsgramBlockId||"").trim();
    if(!window.Telegram?.WebApp){status.textContent="Open this app inside Telegram to request an ad. All tools remain available.";return;}
    if(!/^\d+$/.test(blockId)||blockId==="YOUR_ADSGRAM_BLOCK_ID"){status.textContent="Optional ads are not configured yet. All tools remain available.";return;}
    if(Date.now()-lastAdRequest<30000){status.textContent="Please wait a little before requesting another ad.";return;}
    lastAdRequest=Date.now();button.disabled=true;button.textContent="Preparing ad…";status.textContent="Connecting to the ad provider…";
    try{
      const sdk=await loadAdsgram();
      const controller=sdk.init({blockId});
      if(!controller||typeof controller.show!=="function")throw new Error("AdsGram controller is unavailable");
      button.textContent="Ad requested…";
      const result=await controller.show();
      status.textContent=result?.done===false?"The ad was closed before completion. You can continue using every tool.":"Thanks for supporting the project. All tools remain available.";
    }catch(error){
      console.warn("AdsGram request failed:",error);
      status.textContent="No ad could be shown right now. You can continue using every tool.";
    }finally{
      button.disabled=false;button.innerHTML='Show optional ad <b>↗</b>';
    }
  });

  // Search and category filters are local UI interactions; no search query leaves the device.
  let currentFilter="all";
  function filterTools(){
    const query=$("#tool-search").value.trim().toLowerCase();
    let visible=0;
    $$(".tool-card").forEach(card=>{
      const category=card.dataset.category;
      const matchesCategory=currentFilter==="all"||category===currentFilter;
      const haystack=(card.dataset.search+" "+card.textContent).toLowerCase();
      const matchesText=!query||haystack.includes(query);
      const show=matchesCategory&&matchesText;
      card.hidden=!show;if(show)visible++;
    });
    $("#empty-search").hidden=visible!==0;
  }
  $("#tool-search").addEventListener("input",filterTools);
  $$(".filter-chip").forEach(button=>button.addEventListener("click",()=>{
    $$(".filter-chip").forEach(b=>b.classList.toggle("active",b===button));
    currentFilter=button.dataset.filter;filterTools();
  }));

  // Telegram client setup: theme variables are provided by Telegram's SDK.
  function initTelegram() {
    const tg=window.Telegram?.WebApp;
    if(!tg)return;
    try{
      tg.ready();
      tg.expand();
      if(tg.setHeaderColor)tg.setHeaderColor("#101713");
      if(tg.setBackgroundColor)tg.setBackgroundColor("#101713");
      if(tg.disableVerticalSwipes)tg.disableVerticalSwipes();
      tg.onEvent?.("themeChanged",()=>{
        const p=tg.themeParams||{};
        if(p.bg_color)document.documentElement.style.setProperty("--tg-theme-bg-color",p.bg_color);
        if(p.text_color)document.documentElement.style.setProperty("--tg-theme-text-color",p.text_color);
      });
    }catch(error){console.warn("Telegram Mini App initialization warning:",error);}
  }
  initTelegram();
  updateDashboard();
})();