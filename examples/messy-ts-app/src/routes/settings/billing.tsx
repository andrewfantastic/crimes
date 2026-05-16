// Intentional fixture: this route's vocabulary disagrees with itself.
// `/settings/billing` is `metadata.title = "Plans"`, has `<title>Subscription</title>`,
// the component is `PricingPage`, and nav sources label it "Billing" / "Plans".

export const metadata = { title: "Plans" };

export default function PricingPage() {
  return (
    <main>
      <title>Subscription</title>
      <h1>Choose a plan</h1>
    </main>
  );
}
