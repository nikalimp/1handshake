export const THEME_KEY = "1h-theme";
/** Runs before the page paints (in <head>), so a chosen theme never flashes the other one. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
