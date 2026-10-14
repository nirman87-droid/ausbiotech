import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

// Print-ready table cards: one A5 landscape page per table.
const s = StyleSheet.create({
  page: { padding: 36, fontFamily: "Helvetica", color: "#12262B", backgroundColor: "#FFFFFF" },
  row: { flexDirection: "row", gap: 28, flexGrow: 1 },
  left: { flexGrow: 1, flexBasis: 0, justifyContent: "space-between" },
  eyebrow: { fontSize: 9, letterSpacing: 1, color: "#4A5E64", textTransform: "uppercase" },
  table: { fontSize: 64, fontFamily: "Helvetica-Bold", color: "#006C81", marginTop: 4 },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginTop: 6 },
  body: { fontSize: 11, color: "#24393F", marginTop: 6, lineHeight: 1.4 },
  companies: { marginTop: 14 },
  company: { fontSize: 12, marginBottom: 4 },
  qrBox: { width: 220, alignItems: "center", justifyContent: "center" },
  qr: { width: 210, height: 210 },
  url: { fontSize: 7, color: "#4A5E64", marginTop: 6, textAlign: "center" },
  footer: { fontSize: 8, color: "#4A5E64" },
});

export type TableCard = { number: number; url: string; qr: string; companies: string[] };

export function TableCardsDoc({ eventName, cards }: { eventName: string; cards: TableCard[] }) {
  return (
    <Document title={`${eventName} table cards`} author="ARM Hub">
      {cards.map((c) => (
        <Page key={c.number} size="A5" orientation="landscape" style={s.page}>
          <View style={s.row}>
            <View style={s.left}>
              <View>
                <Text style={s.eyebrow}>{eventName}</Text>
                <Text style={s.table}>Table {c.number}</Text>
                <Text style={s.title}>Scan to start your AI use case</Text>
                <Text style={s.body}>Open your phone or laptop camera, point it at the code, then tap your organisation and your name.</Text>
                <View style={s.companies}>
                  {c.companies.length === 0 ? (
                    <Text style={s.company}>Anyone can join from this table.</Text>
                  ) : (
                    c.companies.map((name) => (
                      <Text key={name} style={s.company}>
                        {name}
                      </Text>
                    ))
                  )}
                </View>
              </View>
              <Text style={s.footer}>ARM Hub AI Adopt workshop</Text>
            </View>
            <View style={s.qrBox}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
              <Image src={c.qr} style={s.qr} />
              <Text style={s.url}>{c.url}</Text>
            </View>
          </View>
        </Page>
      ))}
    </Document>
  );
}
