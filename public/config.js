// Site configuration.
window.NODEGSM_SITE = {
  // The Catalogue (plugin list). Published by the Catalogue repository (GitHub Pages): index.json, plugins/<id>.json, zips/, media/.
  // An absolute URL, or a relative path (e.g. a local checkout built with `npm run build` copied next to the site).
  CATALOG_URL: 'https://ohmcodes.github.io/Node.NodeGSM.Catalogue/',
  // Community backend (ratings, comments, editable info, download counts), see the Node.NodeGSM.WebsiteServer repository (it stores the data).
  //   'auto'  -> use ./api on the same origin (a reverse proxy that forwards /api to the API), else local-only mode
  //   '<url>' -> a backend on another origin, e.g. 'https://api.nodegsm.example/api'
  //   ''      -> force local-only mode (data stays in the visitor's browser)
  API_URL: 'auto',
  REPO: 'https://github.com/ohmcodes/Node.NodeGSM',                      // the app
  CATALOGUE_REPO: 'https://github.com/ohmcodes/Node.NodeGSM.Catalogue',    // where plugins are added (pull requests)
  DISCORD: '',   // invite link, shows up in the footer when set
  DOMAIN: '',    // e.g. https://nodegsm.example
};
