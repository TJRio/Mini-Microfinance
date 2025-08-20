document.addEventListener('DOMContentLoaded', () => {
    // Check if Firebase is initialized
    if (typeof firebase === 'undefined') {
        console.error("Firebase is not loaded. Check your script tags.");
        alert("A critical error occurred. The application cannot start.");
        return;
    }

    const auth = firebase.auth();
    const db = firebase.firestore();

    // --- UNIVERSAL AUTH OBSERVER ---
    auth.onAuthStateChanged(user => {
        const isClientDashboard = document.body.classList.contains('dashboard-body');
        const isAdminDashboard = document.body.classList.contains('admin-dashboard-body');

        if (user) { // User is LOGGED IN
            if (isClientDashboard) initClientDashboard(user);
            else if (isAdminDashboard) initAdminDashboard(user);
        } else { // User is LOGGED OUT
            if (isClientDashboard || isAdminDashboard) {
                window.location.href = 'client-login.html';
            }
        }
    });

    // --- REGISTRATION LOGIC ---
    const registrationForm = document.getElementById('registrationForm');
    if (registrationForm) {
        registrationForm.addEventListener('submit', e => {
            e.preventDefault(); // This is critical
            const submitButton = registrationForm.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            submitButton.textContent = 'Registering...';

            const email = `${registrationForm.phoneNumber.value}@unitymfi.com`;
            const password = registrationForm.password.value;
            auth.createUserWithEmailAndPassword(email, password)
                .then(cred => db.collection('clients').doc(cred.user.uid).set({
                    fullName: registrationForm.fullName.value,
                    phoneNumber: registrationForm.phoneNumber.value,
                    nationalId: registrationForm.idNumber.value,
                    businessName: registrationForm.businessName.value,
                    businessLocation: registrationForm.businessLocation.value,
                    taxStatus: registrationForm.taxStatus.value,
                    accountBalance: 0,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                }))
                .then(() => {
                    alert('Registration Successful! You will now be redirected to the login page.');
                    window.location.href = 'client-login.html';
                })
                .catch(err => {
                    alert(`Registration Failed: ${err.message}`);
                    submitButton.disabled = false;
                    submitButton.textContent = 'Create Account';
                });
        });
    }

    // --- CLIENT LOGIN LOGIC ---
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', e => {
            e.preventDefault(); // This is critical
            const email = `${loginForm.loginPhoneNumber.value}@unitymfi.com`;
            const password = loginForm.loginPassword.value;
            auth.signInWithEmailAndPassword(email, password)
                .then(() => window.location.href = 'client-dashboard.html')
                .catch(err => alert(`Login Failed: ${err.message}`));
        });
    }

    // --- ADMIN LOGIN LOGIC ---
    const adminLoginForm = document.getElementById('adminLoginForm');
    if (adminLoginForm) {
        adminLoginForm.addEventListener('submit', e => {
            e.preventDefault(); // This is critical
            const email = adminLoginForm.adminEmail.value;
            const password = adminLoginForm.adminPassword.value;
            auth.signInWithEmailAndPassword(email, password)
                .then(() => window.location.href = 'admin-dashboard.html')
                .catch(err => alert(`Admin Login Failed: ${err.message}`));
        });
    }

    // --- CLIENT DASHBOARD INITIALIZATION ---
    function initClientDashboard(user) {
        const loader = document.getElementById('loader');
        const content = document.getElementById('dashboardContent');
        let currentClientData = {};

        db.collection('clients').doc(user.uid).onSnapshot(doc => {
            if (doc.exists) {
                currentClientData = doc.data();
                document.getElementById('welcomeMessage').textContent = `Welcome, ${currentClientData.fullName.split(' ')[0]}!`;
                document.getElementById('accountBalance').textContent = `XAF ${currentClientData.accountBalance.toLocaleString()}`;
                document.getElementById('clientName').textContent = currentClientData.fullName;
                document.getElementById('clientPhone').textContent = currentClientData.phoneNumber;
                document.getElementById('clientBusinessName').textContent = currentClientData.businessName;
                document.getElementById('clientBusinessLocation').textContent = currentClientData.businessLocation;
                if(loader) loader.style.display = 'none';
                if(content) content.classList.remove('d-none');
            } else { auth.signOut(); }
        });

        db.collection('transactions').where('clientId', '==', user.uid).orderBy('createdAt', 'desc').limit(10).onSnapshot(snapshot => {
            const tableBody = document.getElementById('transactionHistoryTableBody');
            tableBody.innerHTML = '';
            if (snapshot.empty) tableBody.innerHTML = '<tr><td colspan="4" class="text-center">No transactions found.</td></tr>';
            else snapshot.forEach(doc => {
                const tx = doc.data(); const date = tx.createdAt.toDate().toLocaleDateString();
                const typeClass = tx.type === 'deposit' ? 'text-success' : 'text-danger';
                tableBody.innerHTML += `<tr><td>${date}</td><td class="text-capitalize">${tx.type}</td><td class="${typeClass}">${tx.type === 'deposit' ? '+' : '-'}${tx.amount.toLocaleString()}</td><td><span class="status-badge status-${tx.status}">${tx.status}</span></td></tr>`;
            });
        });

        document.getElementById('depositForm').addEventListener('submit', e => { e.preventDefault(); db.collection('transactions').add({clientId: user.uid, clientName: currentClientData.fullName, type: 'deposit', amount: Number(e.target.depositAmount.value), reference: e.target.depositReference.value, status: 'pending', createdAt: firebase.firestore.FieldValue.serverTimestamp() }).then(() => { alert('Deposit logged for verification!'); e.target.reset(); bootstrap.Modal.getInstance(document.getElementById('depositModal')).hide(); }); });
        document.getElementById('withdrawalForm').addEventListener('submit', e => { e.preventDefault(); const amount = Number(e.target.withdrawalAmount.value); if(amount > currentClientData.accountBalance){alert("Withdrawal amount cannot be greater than your balance.");return;} db.collection('transactions').add({clientId: user.uid, clientName: currentClientData.fullName, type: 'withdrawal', amount: amount, status: 'pending', createdAt: firebase.firestore.FieldValue.serverTimestamp() }).then(() => { alert('Withdrawal request sent!'); e.target.reset(); bootstrap.Modal.getInstance(document.getElementById('withdrawalModal')).hide(); }); });
        document.getElementById('logoutButton').addEventListener('click', () => auth.signOut());
    }

    // --- ADMIN DASHBOARD INITIALIZATION ---
    function initAdminDashboard(user) {
        const loader = document.getElementById('loader');
        const content = document.getElementById('adminDashboardContent');
        db.collection('clients').onSnapshot(snap => { document.getElementById('totalClients').textContent = snap.size; let totalSavings = 0; snap.forEach(doc => totalSavings += doc.data().accountBalance); document.getElementById('totalSavings').textContent = totalSavings.toLocaleString(); });
        db.collection('transactions').where('status', '==', 'pending').orderBy('createdAt', 'desc').onSnapshot(snap => { document.getElementById('pendingTransactions').textContent = snap.size; const tableBody = document.getElementById('pendingTransactionsTableBody'); tableBody.innerHTML = ''; if (snap.empty) tableBody.innerHTML = '<tr><td colspan="6" class="text-center">No pending transactions.</td></tr>'; else snap.forEach(doc => { const tx = doc.data(); tableBody.innerHTML += `<tr><td>${tx.createdAt.toDate().toLocaleString()}</td><td>${tx.clientName}</td><td class="text-capitalize">${tx.type}</td><td>${tx.amount.toLocaleString()}</td><td>${tx.reference || 'N/A'}</td><td><button class="btn btn-sm btn-approve" onclick="handleTransaction('${doc.id}', 'completed', '${tx.clientId}', '${tx.type}', ${tx.amount})">Approve</button><button class="btn btn-sm btn-reject ms-1" onclick="handleTransaction('${doc.id}', 'rejected')">Reject</button></td></tr>`; }); });
        if(loader) loader.style.display = 'none';
        if(content) content.classList.remove('d-none');
        document.getElementById('adminLogoutButton').addEventListener('click', () => auth.signOut());
    }
});

function handleTransaction(txId, newStatus, clientId, type, amount) {
    const db = firebase.firestore();
    const txRef = db.collection('transactions').doc(txId);
    if (newStatus === 'completed') {
        const clientRef = db.collection('clients').doc(clientId);
        db.runTransaction(transaction => transaction.get(clientRef).then(clientDoc => {
            if (!clientDoc.exists) throw "Client not found!";
            const currentBalance = clientDoc.data().accountBalance;
            const newBalance = type === 'deposit' ? currentBalance + amount : currentBalance - amount;
            if (newBalance < 0) throw "Insufficient funds!";
            transaction.update(clientRef, { accountBalance: newBalance });
            transaction.update(txRef, { status: 'completed' });
        })).then(() => alert('Transaction approved!')).catch(err => alert('Error: ' + err));
    } else { txRef.update({ status: 'rejected' }).then(() => alert('Transaction rejected.')); }
}