const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, collection, query, orderBy, limit, getDocs } = require('firebase/firestore');
const readline = require('readline');

const firebaseConfig = {
  apiKey: "AIzaSyDG61e0PX-imPGW_msoq3Cn7FcRzKZ5QRE",
  authDomain: "brgyalert-74b2f.firebaseapp.com",
  projectId: "brgyalert-74b2f",
  storageBucket: "brgyalert-74b2f.firebasestorage.app",
  messagingSenderId: "82872757022",
  appId: "1:82872757022:web:45e13a64eea8bac587b70f",
  measurementId: "G-RD88HC5TEN"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter your BrgyAlert account email: ', (email) => {
  // Hide password input is complex in raw readline, so a standard simple prompt is used
  rl.question('Enter password: ', async (password) => {
    rl.close();
    console.log('\nAuthenticating with Firebase Auth...');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      console.log('Authentication successful!\n');

      console.log('Querying the latest incident report from Firestore...');
      const alertsRef = collection(db, 'alerts');
      const q = query(alertsRef, orderBy('createdAt', 'desc'), limit(1));
      const snap = await getDocs(q);

      if (snap.empty) {
        console.log('No incident reports found in Firestore.');
        return;
      }

      snap.forEach((doc) => {
        const data = doc.data();
        console.log('\n==================================================');
        console.log(`Report ID     : ${doc.id}`);
        console.log(`Reporter Name : ${data.reporterName || 'Anonymous'}`);
        console.log(`Category      : ${data.category}`);
        console.log(`Urgency       : ${data.urgency}`);
        console.log(`Details       : ${data.details}`);
        console.log(`AI Summary    : ${data.aiSummary ? `"${data.aiSummary}"` : '❌ MISSING (AI Summary not generated)'}`);
        console.log('==================================================\n');
      });
    } catch (err) {
      console.error('\nAction failed:', err.message || err);
    }
  });
});
