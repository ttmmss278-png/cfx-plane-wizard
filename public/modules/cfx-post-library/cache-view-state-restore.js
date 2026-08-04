'use strict';
(function(){
  const guardedLoad=load;
  load=async function(){
    const collapsedSnapshot=localStorage.getItem(COLLAPSE_KEY);
    const result=await guardedLoad();
    if(collapsedSnapshot!==null){
      try{
        const values=JSON.parse(collapsedSnapshot);
        state.collapsedCategories=new Set(Array.isArray(values)?values:[]);
        localStorage.setItem(COLLAPSE_KEY,JSON.stringify([...state.collapsedCategories]));
      }catch(error){console.warn('恢复分类折叠状态失败',error);}
    }
    return result;
  };
})();
