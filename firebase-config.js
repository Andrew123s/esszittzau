/* ===================================================================
   FIREBASE CONFIG — paste your project credentials here.

   Where to get this:
   1. Go to https://console.firebase.google.com/ and create a project
      (free Spark tier is plenty for a live presentation).
   2. In the project, click the "</>" (Web) icon to register a web app.
   3. Firebase shows a config object — copy the values into the
      window.ESS_FIREBASE_CONFIG object below.
   4. In the left sidebar, open "Build → Firestore Database" → "Create
      database" → start in test mode (or paste the rules from
      firestore.rules into the Rules tab).

   Leaving every field blank keeps the platform in LOCAL mode — it
   falls back to localStorage and works on a single device only.
   Filling these in unlocks CLOUD mode — rosters and scores sync in
   real time across every device viewing the same arena.
   =================================================================== */

   window.ESS_FIREBASE_CONFIG = {
      apiKey: "AIzaSyDG8AQLFppanDZ8NhW8gn5KAhwnTcXdHRM",
      authDomain: "esspresen.firebaseapp.com",
      projectId: "esspresen",
      storageBucket: "esspresen.firebasestorage.app",
      messagingSenderId: "450696429989",
      appId: "1:450696429989:web:6493acd280fa2fcdf9684c",
    };
    
    /* Default arena id. Multiple parallel arenas are supported via the URL hash,
       e.g. index.html#arena=room-7 – useful if you want two separate scoreboards. */
    window.ESS_DEFAULT_ARENA = "default";
    
