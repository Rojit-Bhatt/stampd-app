import { useNavigate } from "react-router-dom";
import { CustomerProfilePage } from "../components/customer/CustomerProfilePage";

// `/explore/profile` — the same Profile screen the outlet console shows, minus
// any tenant. It can be: name, password, picture and verification all live on
// the global CustomerAccount, so none of it needs to know which cafe you came
// from.
export default function ExploreProfile() {
  const navigate = useNavigate();
  // GlobalCustomerLayout's guard would redirect on its own once globalAccount
  // clears, but doing it here means the navigation happens in the same tick
  // as the logout rather than on the guard's next effect pass.
  return <CustomerProfilePage afterLogout={() => navigate("/customer-login")} />;
}
