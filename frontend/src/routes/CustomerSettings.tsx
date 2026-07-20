import { CustomerProfilePage } from "../components/customer/CustomerProfilePage";

// The outlet console's Profile tab. Identical to /explore/profile — see
// CustomerProfilePage: everything on it belongs to the global account, so
// there is nothing for a tenant-scoped version to do differently. Logging out
// here needs no redirect of its own; CustomerLayout's guard bounces to the
// outlet's login the moment the session goes.
export default function CustomerSettings() {
  return <CustomerProfilePage />;
}
