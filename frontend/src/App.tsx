import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { CustomerAuthProvider } from './context/CustomerAuthContext';
import { AdminAuthProvider } from './context/AdminAuthContext';
import { PlatformAuthProvider } from './context/PlatformAuthContext';
import { TenantProvider } from './context/TenantContext';
import { Toaster } from 'react-hot-toast';
import ErrorBoundary from './components/ErrorBoundary';
import { AdminGuard } from './components/admin/AdminGuard';
import { AdminLayout } from './components/admin/AdminLayout';
import { PlatformLayout } from './components/platform/PlatformLayout';
import { CustomerLayout } from './components/customer/CustomerLayout';

const queryClient = new QueryClient();

// Lazy load pages for route-based code splitting
const BusinessLanding = lazy(() => import('./routes/BusinessLanding'));
const CustomerLogin = lazy(() => import('./routes/CustomerLogin'));
const CustomerRegister = lazy(() => import('./routes/CustomerRegister'));
const CustomerDashboard = lazy(() => import('./routes/CustomerDashboard'));
const CustomerWallet = lazy(() => import('./routes/CustomerWallet'));
const CustomerMenu = lazy(() => import('./routes/CustomerMenu'));
const VerifyEmail = lazy(() => import('./routes/VerifyEmail'));
const ForgotPassword = lazy(() => import('./routes/ForgotPassword'));
const ResetPassword = lazy(() => import('./routes/ResetPassword'));
const PlatformLanding = lazy(() => import('./routes/platform/PlatformLanding'));
const PlatformLogin = lazy(() => import('./routes/platform/PlatformLogin'));
const Businesses = lazy(() => import('./routes/platform/Businesses'));
const OnboardBusiness = lazy(() => import('./routes/platform/OnboardBusiness'));
const BusinessDetail = lazy(() => import('./routes/platform/BusinessDetail'));
const AdminLogin = lazy(() => import('./routes/admin/AdminLogin'));
const AdminOverview = lazy(() => import('./routes/admin/AdminOverview'));
const GenerateQr = lazy(() => import('./routes/admin/GenerateQr'));
const RedeemVoucher = lazy(() => import('./routes/admin/RedeemVoucher'));
const AdminCustomers = lazy(() => import('./routes/admin/AdminCustomers'));
const StampProgram = lazy(() => import('./routes/admin/StampProgram'));
const Branding = lazy(() => import('./routes/admin/Branding'));
const AdminContact = lazy(() => import('./routes/admin/AdminContact'));
const MenuManagement = lazy(() => import('./routes/admin/MenuManagement'));
const AdminReportsSummary = lazy(() => import('./routes/admin/AdminReportsSummary'));
const AdminReportsCustomers = lazy(() => import('./routes/admin/AdminReportsCustomers'));
const NotFound = lazy(() => import('./routes/NotFound'));

// Wraps every /:slug/* route in the tenant context (fetches branding + program,
// themes the subtree, sends X-Tenant-Slug). Renders child routes via <Outlet/>.
function TenantScope() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const tree = (
    <TenantProvider>
      <Outlet />
    </TenantProvider>
  );
  // Only mount the Google provider when a client id is configured, so dev
  // without one still runs (the Google button hides itself in that case).
  return clientId ? <GoogleOAuthProvider clientId={clientId}>{tree}</GoogleOAuthProvider> : tree;
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <PlatformAuthProvider>
        <AdminAuthProvider>
          <CustomerAuthProvider>
            <BrowserRouter>
              <Suspense
                fallback={
                  <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] text-[var(--ink)]">
                    <div className="text-xs font-bold uppercase tracking-[0.2em] animate-pulse">
                      Loading…
                    </div>
                  </div>
                }
              >
                <Routes>
                  {/* Platform (SaaS owner) — unscoped, maroon accent. */}
                  <Route path="/" element={<PlatformLanding />} />
                  <Route path="/platform/login" element={<PlatformLogin />} />
                  <Route path="/platform" element={<PlatformLayout />}>
                    <Route index element={<Businesses />} />
                    <Route path="onboard" element={<OnboardBusiness />} />
                    <Route path="business/:id" element={<BusinessDetail />} />
                  </Route>

                  {/* Tenant-scoped experiences. */}
                  <Route path="/:slug" element={<TenantScope />}>
                    <Route index element={<BusinessLanding />} />
                    <Route path="login" element={<CustomerLogin />} />
                    <Route path="register" element={<CustomerRegister />} />
                    <Route path="verify-email" element={<VerifyEmail />} />
                    <Route path="forgot-password" element={<ForgotPassword />} />
                    <Route path="reset-password" element={<ResetPassword />} />

                    {/* Authenticated customer app (phone shell + bottom nav). */}
                    <Route element={<CustomerLayout />}>
                      <Route path="dashboard" element={<CustomerDashboard />} />
                      <Route path="wallet" element={<CustomerWallet />} />
                      <Route path="menu" element={<CustomerMenu />} />
                    </Route>

                    {/* Business admin console. */}
                    <Route path="admin/login" element={<AdminLogin />} />
                    <Route
                      path="admin"
                      element={
                        <AdminGuard>
                          <AdminLayout />
                        </AdminGuard>
                      }
                    >
                      <Route index element={<AdminOverview />} />
                      <Route path="generate" element={<GenerateQr />} />
                      <Route path="redeem" element={<RedeemVoucher />} />
                      <Route path="customers" element={<AdminCustomers />} />
                      <Route path="program" element={<StampProgram />} />
                      <Route path="branding" element={<Branding />} />
                      <Route path="contact" element={<AdminContact />} />
                      <Route path="menu" element={<MenuManagement />} />
                      <Route path="reports/summary" element={<AdminReportsSummary />} />
                      <Route path="reports/customers" element={<AdminReportsCustomers />} />
                    </Route>
                  </Route>

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
            <Toaster position="bottom-center" />
          </CustomerAuthProvider>
        </AdminAuthProvider>
        </PlatformAuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
