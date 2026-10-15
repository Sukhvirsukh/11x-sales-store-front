import { redirect } from "react-router";

const DASHBOARD_URL = "https://app.11xsales.ai/";

export const loader = () => redirect(DASHBOARD_URL);

export default function Index() {
  return null;
}
