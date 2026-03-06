// Create Supabase client
const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Export for use in other files
window.supabase = _supabase;

// Check authentication state on every page
async function checkAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    // If not logged in and not on public page, redirect to login
    const publicPages = ['login.html', 'register.html', 'forgot-password.html'];
    const currentPage = window.location.pathname.split('/').pop();
    if (!publicPages.includes(currentPage)) {
      window.location.href = 'login.html';
    }
  } else {
    // If logged in and on public page, redirect to dashboard
    const publicPages = ['login.html', 'register.html', 'forgot-password.html'];
    const currentPage = window.location.pathname.split('/').pop();
    if (publicPages.includes(currentPage)) {
      // Determine role and redirect accordingly
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
      if (profile?.role === 'admin') {
        window.location.href = 'admin-dashboard.html';
      } else {
        window.location.href = 'user-dashboard.html';
      }
    }
  }
}

// Run checkAuth on every page
checkAuth();