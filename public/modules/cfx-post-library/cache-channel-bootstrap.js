'use strict';
(function(){
  const NativeBroadcastChannel=window.BroadcastChannel;
  if(typeof NativeBroadcastChannel!=='function')return;
  const LEGACY_CHANNEL='cfxpost_library_cache_channel_v1';

  class GuardedBroadcastChannel{
    constructor(name){
      this.name=String(name||'');
      this._legacy=this.name===LEGACY_CHANNEL;
      this._native=this._legacy?null:new NativeBroadcastChannel(this.name);
      this._onmessage=null;
      this._onmessageerror=null;
      if(this._native){
        this._native.onmessage=event=>{if(typeof this._onmessage==='function')this._onmessage.call(this,event);};
        this._native.onmessageerror=event=>{if(typeof this._onmessageerror==='function')this._onmessageerror.call(this,event);};
      }
    }
    postMessage(value){if(this._native)this._native.postMessage(value);}
    close(){if(this._native)this._native.close();}
    addEventListener(type,listener,options){if(this._native)this._native.addEventListener(type,listener,options);}
    removeEventListener(type,listener,options){if(this._native)this._native.removeEventListener(type,listener,options);}
    dispatchEvent(event){return this._native?this._native.dispatchEvent(event):true;}
    get onmessage(){return this._onmessage;}
    set onmessage(listener){this._onmessage=typeof listener==='function'?listener:null;}
    get onmessageerror(){return this._onmessageerror;}
    set onmessageerror(listener){this._onmessageerror=typeof listener==='function'?listener:null;}
  }

  Object.defineProperty(window,'__CfxNativeBroadcastChannel',{value:NativeBroadcastChannel,configurable:false,writable:false});
  Object.defineProperty(window,'BroadcastChannel',{value:GuardedBroadcastChannel,configurable:true,writable:true});
})();
