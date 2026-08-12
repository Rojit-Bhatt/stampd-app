import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Outlet, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { CustomerAuthProvider } from './context/CustomerAuthContext';
import { AdminAuthProvider } from './context/AdminAuthContext';
import { PlatformAuthProvider } from './context/PlatformAuthContext';
import { CompanyAuthProvider } from './context/CompanyAuthContext';
import { TenantProvider } from './context/TenantContext';
import { CelebrationProvider } from './context/CelebrationContext';
import { Toaster } from "@/lib/toast";
import ErrorBoundary from './components/ErrorBoundary';
import { AdminGuard } from './components/admin/AdminGuard';
import { AdminLayout } from './components/admin/AdminLayout';
import { PlatformLayout } from './components/platform/PlatformLayout';
import { CompanyLayout } from './components/company/CompanyLayout';
import { CustomerLayout } from './components/customer/CustomerLayout';
import { GlobalCustomerLayout } from './components/customer/GlobalCustomerLayout';
import { TenantSessionSync } from './components/customer/TenantSessionSync';

const queryClient = new QueryClient();

// Lazy load pages for route-based code splitting
const BusinessLanding = lazy(() => import('./routes/BusinessLanding'));
const LoginSelect = lazy(() => import('./routes/LoginSelect'));
const GlobalCustomerLogin = lazy(() => import('./routes/GlobalCustomerLogin'));
const GlobalCustomerRegister = lazy(() => import('./routes/GlobalCustomerRegister'));
const Explore = lazy(() => import('./routes/Explore'));
const ExploreEvents = lazy(() => import('./routes/ExploreEvents'));
const ExploreMine = lazy(() => import('./routes/ExploreMine'));
const ExploreProfile = lazy(() => import('./routes/ExploreProfile'));
const CustomerLogin = lazy(() => import('./routes/CustomerLogin'));
const CustomerRegister = lazy(() => import('./routes/CustomerRegister'));
const CustomerDashboard = lazy(() => import('./routes/CustomerDashboard'));
const CustomerHistory = lazy(() => import('./routes/CustomerHistory'));
const RedeemLanding = lazy(() => import('./routes/RedeemLanding'));
const CustomerMenu = lazy(() => import('./routes/CustomerMenu'));
const CustomerRewards = lazy(() => import('./routes/CustomerRewards'));
const VerifyEmail = lazy(() => import('./routes/VerifyEmail'));
const ClaimLanding = lazy(() => import('./routes/ClaimLanding'));
const GlobalVerifyEmail = lazy(() => import('./routes/GlobalVerifyEmail'));
const ForgotPassword = lazy(() => import('./routes/ForgotPassword'));
const ResetPassword = lazy(() => import('./routes/ResetPassword'));
const PlatformLanding = lazy(() => import('./routes/platform/PlatformLanding'));
const Privacy = lazy(() => import('./routes/platform/legal/Privacy'));
const Terms = lazy(() => import('./routes/platform/legal/Terms'));
const ReviewQrGenerator = lazy(() => import('./routes/platform/ReviewQrGenerator'));
const PlatformLogin = lazy(() => import('./routes/platform/PlatformLogin'));
const Companies = lazy(() => import('./routes/platform/Companies'));
const RegisterCompany = lazy(() => import('./routes/platform/RegisterCompany'));
const CompanyDetail = lazy(() => import('./routes/platform/CompanyDetail'));
const PlatformSettings = lazy(() => import('./routes/platform/PlatformSettings'));
const PlatformContact = lazy(() => import('./routes/platform/PlatformContact'));
const PlatformAuditLog = lazy(() => import('./routes/platform/PlatformAuditLog'));
const PlatformAnalytics = lazy(() => import('./routes/platform/PlatformAnalytics'));
const PlatformTeam = lazy(() => import('./routes/platform/PlatformTeam'));
const Plans = lazy(() => import('./routes/platform/Plans'));
const SubscriptionKeys = lazy(() => import('./routes/platform/SubscriptionKeys'));
const CompanyDashboard = lazy(() => import('./routes/company/CompanyDashboard'));
const CompanySubscription = lazy(() => import('./routes/company/CompanySubscription'));
const CompanyReports = lazy(() => import('./routes/company/CompanyReports'));
const CompanyImpact = lazy(() => import('./routes/company/CompanyImpact'));
const AdminLogin = lazy(() => import('./routes/AdminLogin'));
const AdminVerifyEmail = lazy(() => import('./routes/AdminVerifyEmail'));
const AdminForgotPassword = lazy(() => import('./routes/AdminForgotPassword'));
const AdminResetPassword = lazy(() => import('./routes/AdminResetPassword'));
const AdminOverview = lazy(() => import('./routes/admin/AdminOverview'));
const GenerateQr = lazy(() => import('./routes/admin/GenerateQr'));
const RedeemPoints = lazy(() => import('./routes/admin/RedeemPoints'));
const AdminCustomers = lazy(() => import('./routes/admin/AdminCustomers'));
const AdminCustomerDetail = lazy(() => import('./routes/admin/AdminCustomerDetail'));
const PointsProgram = lazy(() => import('./routes/admin/PointsProgram'));
const Branding = lazy(() => import('./routes/admin/Branding'));
const AdminContact = lazy(() => import('./routes/admin/AdminContact'));
const MenuManagement = lazy(() => import('./routes/admin/MenuManagement'));
const AdminEvents = lazy(() => import('./routes/admin/AdminEvents'));
const AdminReportsSummary = lazy(() => import('./routes/admin/AdminReportsSummary'));
const AdminReportsCustomers = lazy(() => import('./routes/admin/AdminReportsCustomers'));
const AdminReportsRedeems = lazy(() => import('./routes/admin/AdminReportsRedeems'));
const AdminImpact = lazy(() => import('./routes/admin/AdminImpact'));
const AdminTransactions = lazy(() => import('./routes/admin/AdminTransactions'));
const AdminCampaigns = lazy(() => import('./routes/admin/AdminCampaigns'));
const AdminBroadcasts = lazy(() => import('./routes/admin/AdminBroadcasts'));
const AdminRewards = lazy(() => import('./routes/admin/AdminRewards'));
const AdminSettings = lazy(() => import('./routes/admin/AdminSettings'));
const AdminSubscription = lazy(() => import('./routes/admin/AdminSubscription'));
const CustomerSettings = lazy(() => import('./routes/CustomerSettings'));
const NotFound = lazy(() => import('./routes/NotFound'));

// Wraps every /:slug/* route in the tenant context (fetches branding + program,
// themes the subtree, sends X-Tenant-Slug). Renders child routes via <Outlet/>.
function TenantScope() {
  return (
    <TenantProvider>
      <TenantSessionSync />
      <CelebrationProvider>
        <Outlet />
      </CelebrationProvider>
    </TenantProvider>
  );
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export default function App() {
  const routes = (
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
          {/* Platform (SaaS owner) — unscoped, never tenant-themed. */}
          <Route path="/" element={<PlatformLanding />} />
          {/* Marketing-site legal pages. Both slugs are in backend
              RESERVED_SLUGS — these literal routes match before
              /:companySlug, so a company on either slug would otherwise
              become unreachable. */}
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          {/* Same reason as /privacy and /terms above: a literal route that
              matches before /:companySlug, so "review-qr" is reserved in
              config/platform.js. */}
          <Route path="/review-qr" element={<ReviewQrGenerator />} />
          {/* The single entry point every marketing-site "Log in" button
              points to — verifies business vs customer before either sign-in
              form renders. Also reserved in config/platform.js. */}
          <Route path="/login" element={<LoginSelect />} />
          <Route path="/platform/login" element={<PlatformLogin />} />
          <Route path="/business-login" element={<Navigate to="/admin-login" replace />} />
          {/* Global customer identity: one CustomerAccount works at
              every tenant, so login/register/the /explore home are
              all slug-less — no tenant context until a business is
              actually entered. */}
          <Route path="/customer-login" element={<GlobalCustomerLogin />} />
          <Route path="/customer-register" element={<GlobalCustomerRegister />} />
          <Route element={<GlobalCustomerLayout />}>
            <Route path="/explore" element={<Explore />} />
            <Route path="/explore/events" element={<ExploreEvents />} />
            <Route path="/explore/mine" element={<ExploreMine />} />
            <Route path="/explore/profile" element={<ExploreProfile />} />
          </Route>
          {/* Global customer-account verification — slug-less, since
              CustomerAccount identity isn't tenant-scoped. */}
          <Route path="/verify-email" element={<GlobalVerifyEmail />} />
          <Route path="/platform" element={<PlatformLayout />}>
            <Route index element={<Companies />} />
            <Route path="register" element={<RegisterCompany />} />
            <Route path="company/:id" element={<CompanyDetail />} />
            <Route path="settings" element={<PlatformSettings />} />
            <Route path="contact" element={<PlatformContact />} />
            <Route path="audit-log" element={<PlatformAuditLog />} />
            <Route path="analytics" element={<PlatformAnalytics />} />
            <Route path="team" element={<PlatformTeam />} />
            <Route path="plans" element={<Plans />} />
            <Route path="subscription-keys" element={<SubscriptionKeys />} />
          </Route>

          <Route path="/admin-login" element={<AdminLogin />} />
          {/* Where the staff verification / reset emails land. Slug-less like
              the login they lead to. Without these an unverified admin is
              locked out permanently — login refuses them with 403. */}
          <Route path="/admin-verify-email" element={<AdminVerifyEmail />} />
          <Route path="/admin-forgot-password" element={<AdminForgotPassword />} />
          <Route path="/admin-reset-password" element={<AdminResetPassword />} />
          <Route path="/company" element={<CompanyLayout />}>
            <Route index element={<CompanyDashboard />} />
            <Route path="reports" element={<CompanyReports />} />
            <Route path="impact" element={<CompanyImpact />} />
            <Route path="subscription" element={<CompanySubscription />} />
          </Route>

          {/* Tenant-scoped experiences. */}
          {/* A company slug alone has no customer-facing page — outlets are
              where customers actually go, so send them to the directory. */}
          <Route path="/:companySlug" element={<Navigate to="/explore" replace />} />

          {/* Tenant-scoped experiences live at /[company]/[outlet]/*. An
              outlet slug is unique only within its company, so both segments
              are always required to identify one. */}
          <Route path="/:companySlug/:outletSlug" element={<TenantScope />}>
            <Route index element={<BusinessLanding />} />
            <Route path="login" element={<CustomerLogin />} />
            <Route path="register" element={<CustomerRegister />} />
            <Route path="claim" element={<ClaimLanding />} />
            {/* Where the counter's staff-initiated redeem QR lands. Outside
                CustomerLayout: it arrives from a phone camera, not the app. */}
            <Route path="redeem" element={<RedeemLanding />} />
            <Route path="verify-email" element={<VerifyEmail />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="reset-password" element={<ResetPassword />} />

            {/* Authenticated customer app (phone shell + bottom nav). */}
            <Route element={<CustomerLayout />}>
              <Route path="dashboard" element={<CustomerDashboard />} />
              <Route path="history" element={<CustomerHistory />} />
              <Route path="menu" element={<CustomerMenu />} />
              <Route path="rewards" element={<CustomerRewards />} />
              <Route path="settings" element={<CustomerSettings />} />
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
              <Route path="redeem" element={<RedeemPoints />} />
              <Route path="customers" element={<AdminCustomers />} />
              <Route path="customers/:id" element={<AdminCustomerDetail />} />
              <Route path="program" element={<PointsProgram />} />
              <Route path="branding" element={<Branding />} />
              <Route path="contact" element={<AdminContact />} />
              <Route path="menu" element={<MenuManagement />} />
              <Route path="events" element={<AdminEvents />} />
              <Route path="settings" element={<AdminSettings />} />
              <Route path="subscription" element={<AdminSubscription />} />
              <Route path="reports/summary" element={<AdminReportsSummary />} />
              <Route path="reports/customers" element={<AdminReportsCustomers />} />
              <Route path="reports/redeem" element={<AdminReportsRedeems />} />
              <Route path="reports/impact" element={<AdminImpact />} />
              <Route path="transactions" element={<AdminTransactions />} />
              <Route path="campaigns" element={<AdminCampaigns />} />
              <Route path="broadcasts" element={<AdminBroadcasts />} />
              <Route path="rewards" element={<AdminRewards />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <PlatformAuthProvider>
          <CompanyAuthProvider>
          <AdminAuthProvider>
            <CustomerAuthProvider>
              {/* Single global provider — Google OAuth is one client id for
                  the whole app, not per-tenant, so every surface (tenant
                  pages and the slug-less global customer pages) shares it.
                  Only mounted when a client id is configured, so dev without
                  one still runs (Google buttons hide themselves). */}
              {GOOGLE_CLIENT_ID ? (
                <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{routes}</GoogleOAuthProvider>
              ) : (
                routes
              )}
              <Toaster />
            </CustomerAuthProvider>
          </AdminAuthProvider>
          </CompanyAuthProvider>
        </PlatformAuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
