// Ensure the DOM is fully loaded before running scripts
document.addEventListener('DOMContentLoaded', function() {

    // --- REGISTRATION LOGIC ---
    const registrationForm = document.getElementById('registrationForm');
    if (registrationForm) {
        registrationForm.addEventListener('submit', function(event) {
            event.preventDefault();
            const fullName = document.getElementById('fullName').value;
            const phoneNumber = document.getElementById('phoneNumber').value;
            const idNumber = document.getElementById('idNumber').value;
            const businessName = document.getElementById('businessName').value;
            const businessLocation = document.getElementById('businessLocation').value;
            const taxStatus = document.getElementById('taxStatus').value;
            const password = document.getElementById('password').value;
            const email = `${phoneNumber}@unitymfi.com`;
            auth.createUserWithEmailAndPassword(email, password)
                .then(userCredential => {
                    const user = userCredential.user;
                    return db.collection('clients').doc(user.uid).set({
                        fullName: fullName, phoneNumber: phoneNumber, nationalId: idNumber,
                        businessName: businessName, businessLocation: businessLocation,
                        taxStatus: taxStatus, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        accountBalance: 0
                    });
                })
                .then(() => {
                    alert('Registration successful! Redirecting to the login page.');
                    window.location.href = 'client-login.html';
                }).catch(error => { console.error("Error during registration: ", error); alert(`Registration failed: ${error.message}`); });
        });
    }

    // --- LOGIN LOGIC ---
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(event) {
            event.preventDefault();
            const phoneNumber = document.getElementById('loginPhoneNumber').value;
            const password = document.getElementById('loginPassword').value;
            const email = `${phoneNumber}@unitymfi.com`;
            auth.signInWithEmailAndPassword(email, password)
                .then(() => { window.location.href = 'client-dashboard.html'; })
                .catch(error => { console.error("Error during login: ", error); alert(`Login failed: ${error.message}`); });
        });
    }

    // --- CLIENT DASHBOARD LOGIC ---
    if (document.body.classList.contains('dashboard-body')) {
        const loader = document.getElementById('loader');
        const dashboardContent = document.getElementById('dashboardContent');
        let currentClientData = {};
        auth.onAuthStateChanged(user => {
            if (user) { fetchClientData(user); setupTransactionListeners(user); } 
            else { alert("You are not logged in."); window.location.href = 'client-login.html'; }
        });
        function fetchClientData(user) {
            db.collection('clients').doc(user.uid).onSnapshot(doc => {
                if (doc.exists) {
                    currentClientData = doc.data();
                    document.getElementById('welcomeMessage').textContent = `Welcome, ${currentClientData.fullName.split(' ')[0]}!`;
                    document.getElementById('accountBalance').textContent = `XAF ${currentClientData.accountBalance.toLocaleString()}`;
                    document.getElementById('clientName').textContent = currentClientData.fullName;
                    document.getElementById('clientPhone').textContent = currentClientData.phoneNumber;
                    document.getElementById('clientBusinessName').textContent = currentClientData.businessName;
                    document.getElementById('clientBusinessLocation').textContent = currentClientData.businessLocation;
                    fetchTransactionHistory(user.uid);
                    loader.classList.add('d-none');
                    dashboardContent.classList.remove('d-none');
                } else { auth.signOut(); }
            }, error => console.error("Error getting client document:", error));
        }
        function fetchTransactionHistory(userId) {
            db.collection('transactions').where('clientId', '==', userId).orderBy('createdAt', 'desc').limit(10).onSnapshot(snapshot => {
                const tableBody = document.getElementById('transactionHistoryTableBody');
                if (snapshot.empty) { tableBody.innerHTML = '<tr><td colspan="4" class="text-center">No transactions yet.</td></tr>'; return; }
                tableBody.innerHTML = '';
                snapshot.forEach(doc => {
                    const tx = doc.data(); const date = tx.createdAt ? tx.createdAt.toDate().toLocaleDateString() : 'N/A';
                    const typeClass = tx.type === 'deposit' ? 'text-success' : 'text-danger';
                    tableBody.innerHTML += `<tr><td>${date}</td><td class="text-capitalize">${tx.type}</td><td class="${typeClass}">${tx.type === 'deposit' ? '+' : '-'}${tx.amount.toLocaleString()}</td><td><span class="status-badge status-${tx.status}">${tx.status}</span></td></tr>`;
                });
            }, error => console.error("Error fetching transactions:", error));
        }
        function setupTransactionListeners(user) {
            const depositForm = document.getElementById('depositForm');
            depositForm.addEventListener('submit', event => {
                event.preventDefault(); const amount = Number(document.getElementById('depositAmount').value);
                const reference = document.getElementById('depositReference').value;
                if (amount > 0 && reference) {
                    db.collection('transactions').add({ clientId: user.uid, clientName: currentClientData.fullName, type: 'deposit', method: 'mobile_money', amount: amount, reference: reference, status: 'pending', createdAt: firebase.firestore.FieldValue.serverTimestamp() })
                    .then(() => { alert('Deposit logged successfully!'); depositForm.reset(); bootstrap.Modal.getInstance(document.getElementById('depositModal')).hide(); })
                    .catch(error => console.error("Error adding deposit: ", error));
                }
            });
            const withdrawalForm = document.getElementById('withdrawalForm');
            withdrawalForm.addEventListener('submit', event => {
                event.preventDefault(); const amount = Number(document.getElementById('withdrawalAmount').value);
                if (amount <= 0) { alert('Please enter a valid amount.'); return; }
                if (amount > currentClientData.accountBalance) { alert('Withdrawal amount exceeds balance.'); return; }
                db.collection('transactions').add({ clientId: user.uid, clientName: currentClientData.fullName, type: 'withdrawal', method: 'agent_cash', amount: amount, status: 'pending', createdAt: firebase.firestore.FieldValue.serverTimestamp() })
                .then(() => { alert('Withdrawal request submitted!'); withdrawalForm.reset(); bootstrap.Modal.getInstance(document.getElementById('withdrawalModal')).hide(); })
                .catch(error => console.error("Error requesting withdrawal: ", error));
            });
        }
        const logoutButton = document.getElementById('logoutButton');
        if (logoutButton) { logoutButton.addEventListener('click', () => { auth.signOut().then(() => { window.location.href = 'index.html'; }); }); }
    }

    // --- ADMIN LOGIN LOGIC ---
    const adminLoginForm = document.getElementById('adminLoginForm');
    if(adminLoginForm) {
        adminLoginForm.addEventListener('submit', event => {
            event.preventDefault();
            const email = document.getElementById('adminEmail').value;
            const password = document.getElementById('adminPassword').value;
            auth.signInWithEmailAndPassword(email, password)
                .then(() => { window.location.href = 'admin-dashboard.html'; })
                .catch(error => { console.error("Admin Login Error: ", error); alert(`Login Failed: ${error.message}`); });
        });
    }

    // --- ADMIN DASHBOARD LOGIC ---
    if (document.body.classList.contains('admin-dashboard-body')) {
        auth.onAuthStateChanged(user => {
            if (user) { setupAdminDashboard(); } 
            else { window.location.href = 'admin-login.html'; }
        });

        function setupAdminDashboard() {
            const loader = document.getElementById('loader');
            const dashboardContent = document.getElementById('adminDashboardContent');
            
            // Fetch stats and pending transactions
            fetchAdminStats();
            fetchPendingTransactions();

            loader.classList.add('d-none');
            dashboardContent.classList.remove('d-none');
        }

        function fetchAdminStats() {
            db.collection('clients').onSnapshot(snapshot => {
                let totalSavings = 0;
                snapshot.forEach(doc => { totalSavings += doc.data().accountBalance; });
                document.getElementById('totalClients').textContent = snapshot.size;
                document.getElementById('totalSavings').textContent = totalSavings.toLocaleString();
            });
            db.collection('transactions').where('status', '==', 'pending').onSnapshot(snapshot => {
                document.getElementById('pendingTransactions').textContent = snapshot.size;
            });
        }

        function fetchPendingTransactions() {
            db.collection('transactions').where('status', '==', 'pending').orderBy('createdAt', 'asc').onSnapshot(snapshot => {
                const tableBody = document.getElementById('pendingTransactionsTableBody');
                if (snapshot.empty) { tableBody.innerHTML = '<tr><td colspan="6" class="text-center">No pending transactions.</td></tr>'; return; }
                tableBody.innerHTML = '';
                snapshot.forEach(doc => {
                    const tx = doc.data(); const txId = doc.id;
                    const date = tx.createdAt.toDate().toLocaleString();
                    tableBody.innerHTML += `
                        <tr>
                            <td>${date}</td>
                            <td>${tx.clientName}</td>
                            <td class="text-capitalize">${tx.type}</td>
                            <td>${tx.amount.toLocaleString()}</td>
                            <td>${tx.reference || 'N/A'}</td>
                            <td>
                                <button class="btn btn-sm btn-approve" onclick="handleTransaction('${txId}', 'completed', '${tx.clientId}', '${tx.type}', ${tx.amount})">Approve</button>
                                <button class="btn btn-sm btn-reject ms-1" onclick="handleTransaction('${txId}', 'rejected')">Reject</button>
                            </td>
                        </tr>`;
                });
            });
        }
        
        const adminLogoutButton = document.getElementById('adminLogoutButton');
        if (adminLogoutButton) { adminLogoutButton.addEventListener('click', () => { auth.signOut().then(() => { window.location.href = 'admin-login.html'; }); }); }
    }
});

// --- GLOBAL FUNCTION FOR ADMIN ACTIONS ---
// This function needs to be global to be called by the `onclick` attribute.
function handleTransaction(txId, newStatus, clientId, type, amount) {
    const txRef = db.collection('transactions').doc(txId);
    const clientRef = db.collection('clients').doc(clientId);

    if (newStatus === 'completed') {
        db.runTransaction(transaction => {
            return transaction.get(clientRef).then(clientDoc => {
                if (!clientDoc.exists) { throw "Client document does not exist!"; }
                
                const newBalance = type === 'deposit' 
                    ? clientDoc.data().accountBalance + amount 
                    : clientDoc.data().accountBalance - amount;

                if (newBalance < 0) { throw "Transaction would result in a negative balance."; }
                
                transaction.update(clientRef, { accountBalance: newBalance });
                transaction.update(txRef, { status: 'completed' });
            });
        }).then(() => {
            alert('Transaction approved successfully!');
        }).catch(error => {
            console.error("Transaction approval failed: ", error);
            alert(`Error approving transaction: ${error}`);
        });
    } else { // For 'rejected' status
        txRef.update({ status: 'rejected' })
            .then(() => alert('Transaction rejected.'))
            .catch(error => console.error("Error rejecting transaction: ", error));
    }
}