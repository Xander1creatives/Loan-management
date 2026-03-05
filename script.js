// Initialize Supabase client
const supabaseUrl = 'https://ptuodksivmqxpkqymkdl.supabase.co';
const supabaseAnonKey = 'sb_publishable_dEQ-orvWq_obC0AmUM--LQ_dWKpkjh7';
const supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

// Global state
let currentUser = null;
let isAdmin = false;

// DOM elements
const authContainer = document.getElementById('auth-container');
const dashboardDiv = document.getElementById('dashboard');
const authFormsDiv = document.getElementById('auth-forms');

// Helper: show error/success messages
function showMessage(element, text, type = 'error') {
  const msgDiv = document.createElement('div');
  msgDiv.className = type;
  msgDiv.textContent = text;
  element.prepend(msgDiv);
  setTimeout(() => msgDiv.remove(), 5000);
}

// ==================== AUTHENTICATION ====================

function renderAuthForms() {
  authFormsDiv.innerHTML = `
    <div id="login-form">
      <h2>Login</h2>
      <input type="email" id="login-email" placeholder="Email" required>
      <input type="password" id="login-password" placeholder="Password" required>
      <button id="login-btn">Login</button>
      <p class="toggle-link" onclick="showRegister()">Don't have an account? Register</p>
      <p class="toggle-link" onclick="showForgotPassword()">Forgot password?</p>
    </div>
  `;

  document.getElementById('login-btn').addEventListener('click', login);
}

function showRegister() {
  authFormsDiv.innerHTML = `
    <div id="register-form">
      <h2>Register</h2>
      <input type="text" id="reg-fullname" placeholder="Full Name" required>
      <input type="email" id="reg-email" placeholder="Email" required>
      <input type="password" id="reg-password" placeholder="Password" required>
      <button id="register-btn">Register</button>
      <p class="toggle-link" onclick="renderAuthForms()">Back to Login</p>
    </div>
  `;

  document.getElementById('register-btn').addEventListener('click', register);
}

function showForgotPassword() {
  authFormsDiv.innerHTML = `
    <div id="forgot-form">
      <h2>Reset Password</h2>
      <input type="email" id="reset-email" placeholder="Your Email" required>
      <button id="reset-btn">Send Reset Email</button>
      <p class="toggle-link" onclick="renderAuthForms()">Back to Login</p>
    </div>
  `;

  document.getElementById('reset-btn').addEventListener('click', forgotPassword);
}

async function login() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    showMessage(authFormsDiv, error.message);
  } else {
    currentUser = data.user;
    await loadUserProfile();
    authContainer.style.display = 'none';
    dashboardDiv.style.display = 'block';
    renderDashboard();
  }
}

async function register() {
  const fullName = document.getElementById('reg-fullname').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName }
    }
  });

  if (error) {
    showMessage(authFormsDiv, error.message);
  } else {
    // Profile will be created via database trigger or manually after confirmation
    showMessage(authFormsDiv, 'Registration successful! Please check your email for verification.', 'success');
    renderAuthForms(); // back to login
  }
}

async function forgotPassword() {
  const email = document.getElementById('reset-email').value;
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });

  if (error) {
    showMessage(authFormsDiv, error.message);
  } else {
    showMessage(authFormsDiv, 'Password reset email sent!', 'success');
  }
}

// ==================== USER PROFILE ====================

async function loadUserProfile() {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  if (error) {
    console.error('Error loading profile:', error);
    // If profile doesn't exist, create it
    if (error.code === 'PGRST116') {
      await supabase.from('profiles').insert([
        { id: currentUser.id, full_name: currentUser.user_metadata?.full_name || '' }
      ]);
    }
  } else {
    isAdmin = profile.is_admin || false;
  }
}

// ==================== DASHBOARD ====================

async function renderDashboard() {
  if (isAdmin) {
    renderAdminDashboard();
  } else {
    renderUserDashboard();
  }
}

// --- User Dashboard ---
async function renderUserDashboard() {
  dashboardDiv.innerHTML = `
    <div class="container">
      <div class="flex">
        <h2>Welcome, ${currentUser.email}</h2>
        <button class="logout-btn" id="logout-btn">Logout</button>
      </div>
      <div class="dashboard-card">
        <h3>Loan Summary</h3>
        <p><strong>Total Owed:</strong> $<span id="total-owed">0</span></p>
        <p><strong>Total Paid:</strong> $<span id="total-paid">0</span></p>
      </div>
      <div class="dashboard-card">
        <h3>Apply for a New Loan</h3>
        <form id="loan-application-form">
          <input type="text" id="apply-fullname" placeholder="Full Name" value="${currentUser.user_metadata?.full_name || ''}" required>
          <input type="email" id="apply-email" placeholder="Email" value="${currentUser.email}" required>
          <input type="tel" id="apply-phone" placeholder="Phone Number">
          <input type="number" id="apply-amount" placeholder="Loan Amount" min="1" step="0.01" required>
          <textarea id="apply-purpose" placeholder="Purpose of Loan" rows="3"></textarea>
          <label for="apply-file">Attach Document (PDF, image):</label>
          <input type="file" id="apply-file" accept=".pdf,.jpg,.jpeg,.png">
          <button type="submit">Submit Application</button>
        </form>
        <div id="application-status"></div>
      </div>
      <div class="dashboard-card">
        <h3>Your Loan Applications</h3>
        <div id="applications-list">Loading...</div>
      </div>
    </div>
  `;

  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('loan-application-form').addEventListener('submit', submitLoanApplication);

  loadUserLoanSummary();
  loadUserApplications();
}

async function loadUserLoanSummary() {
  const { data: loans, error } = await supabase
    .from('loans')
    .select('amount_owed, amount_paid')
    .eq('user_id', currentUser.id);

  if (error) {
    console.error(error);
    return;
  }

  const totalOwed = loans.reduce((sum, loan) => sum + parseFloat(loan.amount_owed), 0);
  const totalPaid = loans.reduce((sum, loan) => sum + parseFloat(loan.amount_paid), 0);

  document.getElementById('total-owed').textContent = totalOwed.toFixed(2);
  document.getElementById('total-paid').textContent = totalPaid.toFixed(2);
}

async function loadUserApplications() {
  const { data: apps, error } = await supabase
    .from('loan_applications')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });

  const listDiv = document.getElementById('applications-list');
  if (error || !apps.length) {
    listDiv.innerHTML = '<p>No applications found.</p>';
    return;
  }

  listDiv.innerHTML = apps.map(app => `
    <div style="border-bottom:1px solid #eee; padding:10px 0;">
      <p><strong>Amount:</strong> $${app.loan_amount}</p>
      <p><strong>Status:</strong> ${app.status}</p>
      <p><strong>Document:</strong> ${app.document_url ? `<a href="${app.document_url}" target="_blank">View</a>` : 'None'}</p>
      <p><small>Submitted: ${new Date(app.created_at).toLocaleString()}</small></p>
    </div>
  `).join('');
}

async function submitLoanApplication(e) {
  e.preventDefault();
  const form = e.target;
  const fileInput = document.getElementById('apply-file');
  const file = fileInput.files[0];

  let documentUrl = null;

  // Upload file if selected
  if (file) {
    const filePath = `${currentUser.id}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('loan-docs')
      .upload(filePath, file);

    if (uploadError) {
      document.getElementById('application-status').innerHTML = `<div class="error">File upload failed: ${uploadError.message}</div>`;
      return;
    }

    const { data: urlData } = supabase.storage
      .from('loan-docs')
      .getPublicUrl(filePath);

    documentUrl = urlData.publicUrl;
  }

  // Insert application
  const { error } = await supabase
    .from('loan_applications')
    .insert([{
      user_id: currentUser.id,
      full_name: document.getElementById('apply-fullname').value,
      email: document.getElementById('apply-email').value,
      phone: document.getElementById('apply-phone').value,
      loan_amount: parseFloat(document.getElementById('apply-amount').value),
      purpose: document.getElementById('apply-purpose').value,
      document_url: documentUrl,
      status: 'pending'
    }]);

  if (error) {
    document.getElementById('application-status').innerHTML = `<div class="error">${error.message}</div>`;
  } else {
    document.getElementById('application-status').innerHTML = '<div class="success">Application submitted successfully!</div>';
    form.reset();
    loadUserApplications(); // refresh list
  }
}

// --- Admin Dashboard ---
async function renderAdminDashboard() {
  dashboardDiv.innerHTML = `
    <div class="container">
      <div class="flex">
        <h2>Admin Panel</h2>
        <button class="logout-btn" id="logout-btn">Logout</button>
      </div>
      <div class="dashboard-card">
        <h3>Add Loan for User</h3>
        <form id="add-loan-form">
          <input type="email" id="loan-user-email" placeholder="User Email" required>
          <input type="number" id="loan-amount" placeholder="Amount Owed" min="0" step="0.01" required>
          <input type="number" id="loan-paid" placeholder="Amount Paid (optional)" step="0.01">
          <button type="submit">Add Loan</button>
        </form>
        <div id="admin-message"></div>
      </div>
      <div class="dashboard-card">
        <h3>Pending Loan Applications</h3>
        <div id="pending-apps">Loading...</div>
      </div>
    </div>
  `;

  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('add-loan-form').addEventListener('submit', addLoanForUser);

  loadPendingApplications();
}

async function addLoanForUser(e) {
  e.preventDefault();
  const email = document.getElementById('loan-user-email').value;
  const amountOwed = parseFloat(document.getElementById('loan-amount').value);
  const amountPaid = parseFloat(document.getElementById('loan-paid').value) || 0;

  // Find user by email
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('email? maybe need to join with auth.users? Actually profiles dont have email, we need to get from auth.users')
    // Simpler: we can store email in profiles or use auth.admin api. For demo, we'll assume email is in profiles.
    // Alternatively, we can fetch from auth.users using service role, but that's not safe client-side.
    // Let's add email column to profiles for simplicity.

  // To keep it simple, we'll assume we have email in profiles (add it if not).
  // In real world, you'd use a server function. For demo, we'll just create the loan directly.
  // We'll modify the code to first fetch user id from auth using a serverless function or we'll add email column.

  // For now, we'll just show a message that this requires email column in profiles.
  document.getElementById('admin-message').innerHTML = '<div class="error">Email lookup not implemented in demo. Please add email column to profiles or use admin API.</div>';
}

// To make admin work, we need to either:
// 1. Add email column to profiles and populate it during registration.
// 2. Use a Supabase Edge Function.
// For simplicity, we'll modify the registration to store email in profiles.

// Update registration function to also insert into profiles with email.
// We'll also modify loadUserProfile to expect email.

// I'll refactor registration:

async function register() {
  const fullName = document.getElementById('reg-fullname').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName }
    }
  });

  if (error) {
    showMessage(authFormsDiv, error.message);
  } else {
    // Insert into profiles manually (if user created)
    if (data.user) {
      await supabase.from('profiles').insert([
        { id: data.user.id, full_name: fullName, email: email }
      ]);
    }
    showMessage(authFormsDiv, 'Registration successful! Please check your email for verification.', 'success');
    renderAuthForms();
  }
}

// Then add email column to profiles:
// ALTER TABLE profiles ADD COLUMN email TEXT;

// Now admin can look up by email.
async function addLoanForUser(e) {
  e.preventDefault();
  const email = document.getElementById('loan-user-email').value;
  const amountOwed = parseFloat(document.getElementById('loan-amount').value);
  const amountPaid = parseFloat(document.getElementById('loan-paid').value) || 0;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single();

  if (error || !profile) {
    document.getElementById('admin-message').innerHTML = '<div class="error">User not found.</div>';
    return;
  }

  const { error: insertError } = await supabase
    .from('loans')
    .insert([{
      user_id: profile.id,
      amount_owed: amountOwed,
      amount_paid: amountPaid
    }]);

  if (insertError) {
    document.getElementById('admin-message').innerHTML = `<div class="error">${insertError.message}</div>`;
  } else {
    document.getElementById('admin-message').innerHTML = '<div class="success">Loan added successfully!</div>';
    e.target.reset();
  }
}

// Load pending applications for admin
async function loadPendingApplications() {
  const { data: apps, error } = await supabase
    .from('loan_applications')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  const container = document.getElementById('pending-apps');
  if (error) {
    container.innerHTML = '<p>Error loading applications.</p>';
    return;
  }

  if (!apps.length) {
    container.innerHTML = '<p>No pending applications.</p>';
    return;
  }

  container.innerHTML = apps.map(app => `
    <div style="border-bottom:1px solid #eee; padding:10px 0;">
      <p><strong>${app.full_name}</strong> (${app.email})</p>
      <p>Amount: $${app.loan_amount} | Purpose: ${app.purpose || 'N/A'}</p>
      <p>Document: ${app.document_url ? `<a href="${app.document_url}" target="_blank">View</a>` : 'None'}</p>
      <button class="approve-btn" data-id="${app.id}">Approve</button>
      <button class="reject-btn" data-id="${app.id}">Reject</button>
    </div>
  `).join('');

  // Add event listeners for approve/reject
  document.querySelectorAll('.approve-btn').forEach(btn => {
    btn.addEventListener('click', () => updateApplicationStatus(btn.dataset.id, 'approved'));
  });
  document.querySelectorAll('.reject-btn').forEach(btn => {
    btn.addEventListener('click', () => updateApplicationStatus(btn.dataset.id, 'rejected'));
  });
}

async function updateApplicationStatus(appId, status) {
  const { error } = await supabase
    .from('loan_applications')
    .update({ status })
    .eq('id', appId);

  if (error) {
    alert('Error updating status: ' + error.message);
  } else {
    // If approved, create a loan record
    if (status === 'approved') {
      const { data: app } = await supabase
        .from('loan_applications')
        .select('user_id, loan_amount')
        .eq('id', appId)
        .single();

      if (app) {
        await supabase
          .from('loans')
          .insert([{
            user_id: app.user_id,
            amount_owed: app.loan_amount,
            amount_paid: 0
          }]);
      }
    }
    loadPendingApplications(); // refresh
  }
}

// ==================== LOGOUT ====================

async function logout() {
  await supabase.auth.signOut();
  currentUser = null;
  isAdmin = false;
  dashboardDiv.style.display = 'none';
  authContainer.style.display = 'block';
  renderAuthForms();
}

// ==================== CHECK AUTH STATE ====================

async function checkUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    currentUser = user;
    await loadUserProfile();
    authContainer.style.display = 'none';
    dashboardDiv.style.display = 'block';
    renderDashboard();
  } else {
    renderAuthForms();
  }
}

// Initialize
checkUser();

// Expose functions to global for onclick
window.showRegister = showRegister;
window.showForgotPassword = showForgotPassword;