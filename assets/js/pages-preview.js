
document.addEventListener('submit',event=>{
  if(event.target.matches('[data-preview-form]')){event.preventDefault();event.stopImmediatePropagation();}
},true);
