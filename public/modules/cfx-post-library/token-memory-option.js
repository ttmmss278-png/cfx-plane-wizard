'use strict';
(function(){
  const previousLoadGithubConfig=loadGithubConfig;
  const previousSaveGithubConfig=saveGithubConfig;

  function restoreRememberTokenControl(){
    const remember=$('#rememberToken');
    if(!remember)return;
    const rememberedToken=localStorage.getItem(GITHUB_TOKEN_KEY)||'';
    const label=remember.closest('label');
    remember.disabled=false;
    remember.checked=!!rememberedToken;
    if(label){
      label.style.display='';
      label.title='仅在这台私人电脑上使用。Token 会保存在当前网站的浏览器本地存储中。';
    }
    const tokenInput=$('#ghToken');
    if(tokenInput&&!tokenInput.value&&rememberedToken)tokenInput.value=rememberedToken;
  }

  loadGithubConfig=function(){
    previousLoadGithubConfig();
    restoreRememberTokenControl();
  };

  saveGithubConfig=function(){
    const remember=$('#rememberToken');
    const token=$('#ghToken')?.value.trim()||'';
    previousSaveGithubConfig();
    if(remember?.checked&&token)localStorage.setItem(GITHUB_TOKEN_KEY,token);
    else localStorage.removeItem(GITHUB_TOKEN_KEY);
    restoreRememberTokenControl();
  };
})();
