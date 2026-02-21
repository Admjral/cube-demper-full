import Header from './components/Header'
import Footer from './components/Footer'
import Hero from './sections/Hero'
import SocialProof from './sections/SocialProof'
import FeaturesOverview from './sections/FeaturesOverview'
import HowItWorks from './sections/HowItWorks'
import ModulesShowcase from './sections/ModulesShowcase'
import Pricing from './sections/Pricing'
import FAQ from './sections/FAQ'
import CTA from './sections/CTA'

export default function App() {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <Hero />
        <SocialProof />
        <FeaturesOverview />
        <HowItWorks />
        <ModulesShowcase />
        <Pricing />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  )
}
