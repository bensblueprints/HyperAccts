const filters=document.querySelectorAll('[data-filter]');
for(const button of filters)button.addEventListener('click',()=>{
  for(const item of filters){const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));}
  for(const card of document.querySelectorAll('[data-category]'))card.hidden=button.dataset.filter!=='all'&&card.dataset.category!==button.dataset.filter;
});
const run=document.querySelector('#demo-run'),rows=[...document.querySelectorAll('#demo-rows li b')],message=document.querySelector('#demo-message'),count=document.querySelector('#demo-count');
run.addEventListener('click',async()=>{
  run.disabled=true;message.textContent='Simulating three sample records…';count.textContent='0 / 3';for(const row of rows){row.textContent='Ready';row.className='';}
  for(let i=0;i<rows.length;i++){
    rows[i].textContent='Processing…';await new Promise(resolve=>setTimeout(resolve,700));
    rows[i].textContent=['Complete','Needs review','Failed'][i];rows[i].className='status '+['mint','lavender','cream'][i];count.textContent=`${i+1} / 3`;
  }
  message.textContent='Complete. All outcomes were simulated.';run.textContent='Run again →';run.disabled=false;
});
