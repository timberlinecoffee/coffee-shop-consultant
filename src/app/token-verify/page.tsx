import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function TokenVerifyPage() {
  return (
    <div className="min-h-screen bg-background p-8 space-y-8 font-sans">
      <h1 className="text-h1 font-semibold text-foreground" style={{ fontSize: "var(--text-h1)", lineHeight: "var(--text-h1-lh)" }}>
        Timberline Token Verification
      </h1>

      {/* Button variants — primary should be teal */}
      <Card>
        <CardHeader>
          <CardTitle>Button — all variants</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="default">Primary (teal)</Button>
          <Button variant="secondary">Secondary (sage)</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
        </CardContent>
      </Card>

      {/* Button sizes */}
      <Card>
        <CardHeader>
          <CardTitle>Button — sizes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button size="xs">Extra small</Button>
          <Button size="sm">Small</Button>
          <Button size="default">Default</Button>
          <Button size="lg">Large</Button>
        </CardContent>
      </Card>

      {/* Input */}
      <Card>
        <CardHeader>
          <CardTitle>Input</CardTitle>
        </CardHeader>
        <CardContent className="max-w-sm space-y-3">
          <Input placeholder="Email address" type="email" />
          <Input placeholder="Password" type="password" />
        </CardContent>
      </Card>

      {/* Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>Tabs</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="espresso">
            <TabsList>
              <TabsTrigger value="espresso">Espresso</TabsTrigger>
              <TabsTrigger value="pour-over">Pour Over</TabsTrigger>
              <TabsTrigger value="cupping">Cupping</TabsTrigger>
            </TabsList>
            <TabsContent value="espresso" className="pt-4 text-body-sm text-muted-foreground">
              Espresso extraction fundamentals — pressure, temperature, grind.
            </TabsContent>
            <TabsContent value="pour-over" className="pt-4 text-body-sm text-muted-foreground">
              Pour over variables — bloom, flow rate, water distribution.
            </TabsContent>
            <TabsContent value="cupping" className="pt-4 text-body-sm text-muted-foreground">
              Cupping protocol — SCA standard, scoring, sensory vocabulary.
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Token color swatches */}
      <Card>
        <CardHeader>
          <CardTitle>Token swatches</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {[
            { label: "primary (teal)", className: "bg-primary text-primary-foreground" },
            { label: "secondary (sage)", className: "bg-secondary text-secondary-foreground" },
            { label: "accent (crema)", className: "bg-accent text-accent-foreground" },
            { label: "muted", className: "bg-muted text-muted-foreground" },
            { label: "destructive", className: "bg-destructive/20 text-destructive" },
            { label: "card", className: "bg-card text-card-foreground border border-border" },
          ].map(({ label, className }) => (
            <div key={label} className={`rounded-lg px-4 py-2 text-sm font-medium ${className}`}>
              {label}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
