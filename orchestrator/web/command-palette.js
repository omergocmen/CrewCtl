(function(){
  'use strict';
  
  const $=s=>document.querySelector(s);
  const $$=s=>document.querySelectorAll(s);
  
  const ESCAPE=function(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))};
  
  const COMMANDS=[
    {id:'nav-home',title:'Ana Sayfa',description:'Komuta Merkezi\'ne git',category:'Navigation',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',action:()=>location.href='index.html',shortcut:'Alt+H',keywords:['home','main','start','ana','sayfa']},
    {id:'nav-flow',title:'Ekip Akışı',description:'3B orkestrasyon görünümü',category:'Navigation',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',action:()=>location.href='flow.html',shortcut:'Alt+F',keywords:['flow','team','akış','ekip','3d','görsel']},
    {id:'nav-code',title:'Canlı Kod',description:'Kod değişikliklerini izle',category:'Navigation',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',action:()=>location.href='code.html',shortcut:'Alt+C',keywords:['code','live','kod','canlı','diff']},
    {id:'nav-board',title:'Görev Panosu',description:'Kanban panosu',category:'Navigation',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',action:()=>location.href='board.html',shortcut:'Alt+B',keywords:['board','kanban','pano','görev']},
    {id:'theme-toggle',title:'Tema Değiştir',description:'Açık/koyu tema geçişi',category:'System',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',action:()=>{if(typeof toggleTheme==='function')toggleTheme();close()},shortcut:'Alt+T',keywords:['theme','dark','light','tema','mod']},
    {id:'engine-start',title:'Motoru Başlat',description:'Operatör motorunu çalıştır',category:'System',icon:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',action:()=>{if(typeof engine==='function')engine('start');close()},shortcut:'Alt+S',keywords:['start','engine','motor','başlat','run']},
    {id:'engine-stop',title:'Motoru Durdur',description:'Operatör motorunu durdur',category:'System',icon:'<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',action:()=>{if(typeof engine==='function')engine('stop');close()},keywords:['stop','engine','motor','durdur','halt']},
    {id:'open-settings',title:'Ayarlar',description:'Sistem ayarlarını aç',category:'System',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6M5.6 5.6l4.2 4.2m4.2 4.2l4.2 4.2M1 12h6m6 0h6M5.6 18.4l4.2-4.2m4.2-4.2l4.2-4.2"/></svg>',action:()=>{if(typeof openSettings==='function')openSettings();close()},shortcut:'Alt+,',keywords:['settings','config','ayarlar','tercih']},
    {id:'refresh-page',title:'Sayfayı Yenile',description:'Sayfayı yeniden yükle',category:'Utility',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>',action:()=>location.reload(),shortcut:'F5',keywords:['refresh','reload','yenile','update']},
    {id:'fullscreen-toggle',title:'Tam Ekran',description:'Tam ekran modunu aç/kapat',category:'Utility',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>',action:()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen();else document.exitFullscreen();close()},shortcut:'F11',keywords:['fullscreen','tam ekran','expand']},
    {id:'copy-url',title:'URL Kopyala',description:'Sayfa adresini kopyala',category:'Utility',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',action:()=>{navigator.clipboard.writeText(location.href).then(()=>showToast('URL kopyalandı!','ok')).catch(()=>showToast('Kopyalanamadı','err'));close()},shortcut:'Alt+U',keywords:['copy','url','link','kopyala','adres']},
    {id:'help-center',title:'Yardım Merkezi',description:'Kullanım kılavuzu',category:'Help',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',action:()=>{const helpBtn=$('#helpBtn');if(helpBtn)helpBtn.click();close()},shortcut:'Alt+?',keywords:['help','yardım','guide','kılavuz']},
    {id:'keyboard-shortcuts',title:'Klavye Kısayolları',description:'Tüm kısayolları gör',category:'Help',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h8M6 16h12"/></svg>',action:()=>showShortcutsModal(),keywords:['keyboard','shortcuts','klavye','kısayol']},
  ];
  
  let isOpen=false;
  let selectedIndex=0;
  let searchTerm='';
  let activeCategory='All';
  let commandHistory=[];
  
  try{
    const saved=localStorage.getItem('commandHistory');
    if(saved)commandHistory=JSON.parse(saved);
  }catch{}
  
  const CATEGORIES=['All',...new Set(COMMANDS.map(c=>c.category))];
  
  function recordUsage(id){
    const now=Date.now();
    const existing=commandHistory.find(c=>c.id===id);
    if(existing){
      existing.timestamp=now;
      existing.count++;
    }else{
      commandHistory.push({id,timestamp:now,count:1});
    }
    commandHistory.sort((a,b)=>b.count-a.count||b.timestamp-a.timestamp);
    commandHistory=commandHistory.slice(0,10);
    try{localStorage.setItem('commandHistory',JSON.stringify(commandHistory))}catch{}
  }
  
  function getRecent(){
    return commandHistory.slice(0,5).map(h=>{
      const cmd=COMMANDS.find(c=>c.id===h.id);
      return cmd?{...cmd}:null;
    }).filter(c=>c);
  }
  
  function getFiltered(){
    const search=searchTerm.toLowerCase();
    return COMMANDS.filter(cmd=>{
      if(activeCategory!=='All'&&cmd.category!==activeCategory)return false;
      if(!search)return true;
      return cmd.title.toLowerCase().includes(search)||
             cmd.description.toLowerCase().includes(search)||
             (cmd.keywords&&cmd.keywords.some(k=>k.includes(search)));
    });
  }
  
  function getDisplayItems(){
    if(searchTerm)return getFiltered();
    const recents=getRecent();
    const filtered=getFiltered().filter(c=>!recents.some(r=>r.id===c.id));
    return [...recents,...filtered.slice(0,10)];
  }
  
  function showToast(message,type){
    let box=$('#toasts');
    if(!box){
      box=document.createElement('div');
      box.id='toasts';
      document.body.appendChild(box);
    }
    const toast=document.createElement('div');
    toast.className='toast '+(type||'');
    toast.innerHTML=`<span style="font-weight:750">${message}</span>`;
    box.appendChild(toast);
    setTimeout(()=>{toast.style.opacity='0';setTimeout(()=>toast.remove(),300)},3000);
  }
  
  function renderPalette(){
    const items=getDisplayItems();
    const categories=activeCategory==='All'&&!searchTerm?CATEGORIES:[];
    
    return `
      <div class="cp-overlay" onclick="window.CommandPalette.close()">
        <div class="cp-container" onclick="event.stopPropagation()">
          <div class="cp-header">
            <span class="cp-search-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;display:block;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></span>
            <input type="text" class="cp-input" id="cpInput" placeholder="Komut ara veya @ yazın..." value="${ESCAPE(searchTerm)}" oninput="window.CommandPalette.search(this.value)">
            <div class="cp-hint">
              <kbd>Esc</kbd> kapat
            </div>
          </div>
          ${categories.length>0?`
            <div class="cp-categories">
              ${categories.map(cat=>`
                <button class="cp-cat-btn ${cat===activeCategory?'active':''}" onclick="window.CommandPalette.setCategory('${ESCAPE(cat)}')">${ESCAPE(cat)}</button>
              `).join('')}
            </div>
          `:''}
          <div class="cp-list" id="cpList">
            ${items.length===0?`
              <div class="cp-empty">
                <span>Sonuç bulunamadı</span>
              </div>
            `:items.map((item,idx)=>`
              <div class="cp-item ${idx===selectedIndex?'selected':''}" 
                   data-index="${idx}"
                   onclick="window.CommandPalette.execute(${idx})"
                   onmouseenter="window.CommandPalette.select(${idx})">
                <span class="cp-icon">${item.icon}</span>
                <div class="cp-content">
                  <div class="cp-title">${ESCAPE(item.title)}</div>
                  <div class="cp-desc">${ESCAPE(item.description)}</div>
                </div>
                <span class="cp-category">${ESCAPE(item.category)}</span>
                ${item.shortcut?`<kbd class="cp-shortcut">${ESCAPE(item.shortcut)}</kbd>`:''}
              </div>
            `).join('')}
          </div>
          <div class="cp-footer">
            <div class="cp-footer-left">
              <kbd>Ctrl</kbd>+<kbd>K</kbd> aç/kapat
            </div>
            <div class="cp-footer-right">
              <kbd>↑↓</kbd> gezin <kbd>Enter</kbd> çalıştır
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  function injectStyles(){
    if($('#cpStyles'))return;
    const style=document.createElement('style');
    style.id='cpStyles';
    style.textContent=`
      .cp-overlay{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;padding:10vh 20px;animation:cpFadeIn .2s ease}
      @keyframes cpFadeIn{from{opacity:0}to{opacity:1}}
      .cp-container{width:100%;max-width:680px;max-height:70vh;background:var(--panel);border:1px solid var(--line);border-radius:16px;box-shadow:0 24px 80px rgba(0,0,0,0.6);display:flex;flex-direction:column;overflow:hidden;animation:cpSlideIn .25s cubic-bezier(.2,.8,.2,1)}
      @keyframes cpSlideIn{from{opacity:0;transform:translateY(-20px) scale(.96)}to{opacity:1;transform:none}}
      .cp-header{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line)}
      .cp-search-icon{font-size:18px;opacity:.5}
      .cp-input{flex:1;background:transparent;border:0;color:var(--tx);font-size:14px;outline:none}
      .cp-input::placeholder{color:var(--dim)}
      .cp-hint{display:flex;gap:4px;align-items:center;color:var(--dim);font-size:11px}
      .cp-hint kbd{padding:2px 6px;background:var(--panel2);border:1px solid var(--line);border-radius:4px;font-size:10px;font-family:ui-monospace,monospace}
      .cp-categories{display:flex;gap:6px;padding:8px 12px;border-bottom:1px solid var(--line);overflow-x:auto}
      .cp-cat-btn{padding:5px 12px;border-radius:999px;border:1px solid var(--line);background:var(--panel2);color:var(--dim);font-size:11px;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap}
      .cp-cat-btn:hover{border-color:var(--acc);color:var(--tx)}
      .cp-cat-btn.active{background:var(--acc);color:#fff;border-color:var(--acc)}
      .cp-list{flex:1;overflow-y:auto;padding:8px 6px;max-height:45vh}
      .cp-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer;transition:all .12s;margin:2px 0}
      .cp-item:hover,.cp-item.selected{background:color-mix(in srgb,var(--acc) 12%,var(--panel2))}
      .cp-item.selected{border-left:3px solid var(--acc);padding-left:9px}
      .cp-icon{font-size:18px;flex:none;width:20px;height:20px;display:flex;align-items:center;justify-content:center;color:var(--acc)}
      .cp-icon svg{width:16px;height:16px;stroke-width:2}
      .cp-content{flex:1;min-width:0}
      .cp-title{font-weight:700;font-size:13px;color:var(--tx)}
      .cp-desc{font-size:11px;color:var(--dim);margin-top:2px}
      .cp-category{font-size:10px;color:var(--dim);padding:2px 8px;border:1px solid var(--line);border-radius:999px;background:var(--panel2)}
      .cp-shortcut{padding:3px 6px;background:var(--input);border:1px solid var(--line);border-radius:4px;font-size:10px;font-family:ui-monospace,monospace;color:var(--dim)}
      .cp-empty{text-align:center;padding:40px 20px;color:var(--dim)}
      .cp-footer{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-top:1px solid var(--line);font-size:10px;color:var(--dim)}
      .cp-footer kbd{padding:2px 5px;background:var(--panel2);border:1px solid var(--line);border-radius:3px;font-size:9px;font-family:ui-monospace,monospace;margin:0 2px}
      @media(max-width:640px){.cp-container{max-height:85vh;padding-bottom:env(safe-area-inset-bottom)}.cp-footer{display:none}}
    `;
    document.head.appendChild(style);
  }
  
  function open(){
    if(isOpen)return;
    isOpen=true;
    selectedIndex=0;
    searchTerm='';
    activeCategory='All';
    injectStyles();
    const div=document.createElement('div');
    div.id='commandPalette';
    div.innerHTML=renderPalette();
    document.body.appendChild(div);
    const input=$('#cpInput');
    if(input)input.focus();
    document.body.style.overflow='hidden';
  }
  
  function close(){
    if(!isOpen)return;
    isOpen=false;
    const el=$('#commandPalette');
    if(el)el.remove();
    document.body.style.overflow='';
  }
  
  function toggle(){
    if(isOpen)close();
    else open();
  }
  
  function search(term){
    searchTerm=term;
    selectedIndex=0;
    updateList();
  }
  
  function setCategory(cat){
    activeCategory=cat;
    selectedIndex=0;
    updateList();
  }
  
  function select(idx){
    selectedIndex=idx;
    updateList();
    const el=$(`.cp-item[data-index="${idx}"]`);
    if(el)el.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  
  function execute(idx){
    const items=getDisplayItems();
    const item=items[idx];
    if(item&&item.action){
      recordUsage(item.id);
      item.action();
      close();
    }
  }
  
  function updateList(){
    const list=$('#cpList');
    const container=$('.cp-container');
    if(!list||!container)return;
    
    const items=getDisplayItems();
    
    list.innerHTML=items.length===0?`
      <div class="cp-empty">
        <span>Sonuç bulunamadı</span>
      </div>
    `:items.map((item,idx)=>`
      <div class="cp-item ${idx===selectedIndex?'selected':''}" 
           data-index="${idx}"
           onclick="window.CommandPalette.execute(${idx})"
           onmouseenter="window.CommandPalette.select(${idx})">
        <span class="cp-icon">${item.icon}</span>
        <div class="cp-content">
          <div class="cp-title">${ESCAPE(item.title)}</div>
          <div class="cp-desc">${ESCAPE(item.description)}</div>
        </div>
        <span class="cp-category">${ESCAPE(item.category)}</span>
        ${item.shortcut?`<kbd class="cp-shortcut">${ESCAPE(item.shortcut)}</kbd>`:''}
      </div>
    `).join('');
  }
  
  function handleKey(e){
    if(e.key==='k'&&(e.metaKey||e.ctrlKey)){
      e.preventDefault();
      toggle();
      return;
    }
    
    if(!isOpen)return;
    
    const items=getDisplayItems();
    
    if(e.key==='ArrowDown'){
      e.preventDefault();
      selectedIndex=Math.min(selectedIndex+1,items.length-1);
      updateList();
      const el=$(`.cp-item[data-index="${selectedIndex}"]`);
      if(el)el.scrollIntoView({block:'nearest',behavior:'smooth'});
    }else if(e.key==='ArrowUp'){
      e.preventDefault();
      selectedIndex=Math.max(selectedIndex-1,0);
      updateList();
      const el=$(`.cp-item[data-index="${selectedIndex}"]`);
      if(el)el.scrollIntoView({block:'nearest',behavior:'smooth'});
    }else if(e.key==='Enter'){
      e.preventDefault();
      execute(selectedIndex);
    }else if(e.key==='Escape'){
      e.preventDefault();
      close();
    }
  }
  
  function showShortcutsModal(){
    const shortcuts=COMMANDS.filter(c=>c.shortcut).map(c=>`
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="width:20px;height:20px;display:flex;align-items:center;justify-content:center;color:var(--acc)">${c.icon}</span>
          <span>${ESCAPE(c.title)}</span>
        </div>
        <kbd style="padding:4px 10px;background:var(--panel2);border:1px solid var(--line);border-radius:6px;font-size:11px;font-family:ui-monospace,monospace">${ESCAPE(c.shortcut)}</kbd>
      </div>
    `).join('');
    
    const modal=document.createElement('div');
    modal.id='shortcutsModal';
    modal.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;padding:20px';
    modal.innerHTML=`
      <div style="background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:24px;max-width:560px;width:100%;max-height:80vh;overflow:auto;box-shadow:var(--shadow)">
        <h3 style="margin:0 0 18px;font-size:16px;font-weight:700">Klavye Kısayolları</h3>
        ${shortcuts}
        <button onclick="document.getElementById('shortcutsModal').remove()" style="margin-top:20px;width:100%;padding:10px;background:var(--acc);border:0;border-radius:8px;color:#fff;font-weight:700;cursor:pointer;font-size:13px">Kapat</button>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{if(e.target===modal)modal.remove()});
  }
  
  document.addEventListener('keydown',handleKey);
  
  window.CommandPalette={open,close,toggle,search,setCategory,select,execute};
})();
