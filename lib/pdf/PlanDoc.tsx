import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

// The final AI starter plan on one A4 page.
const s = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10, color: "#24393F", backgroundColor: "#FFFFFF", lineHeight: 1.4 },
  eyebrow: { fontSize: 8, letterSpacing: 1, color: "#4A5E64", textTransform: "uppercase" },
  company: { fontSize: 11, color: "#4A5E64", marginTop: 2 },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#12262B", marginTop: 8 },
  rule: { borderBottomWidth: 2, borderBottomColor: "#006C81", marginVertical: 12, width: 60 },
  h: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#12262B", marginTop: 12, marginBottom: 4 },
  measures: { flexDirection: "row", gap: 8, marginTop: 4 },
  measure: { flexGrow: 1, flexBasis: 0, borderWidth: 1, borderColor: "#D5DFE2", borderRadius: 6, padding: 8 },
  mLabel: { fontSize: 7, letterSpacing: 0.8, textTransform: "uppercase", color: "#4A5E64" },
  mValue: { fontSize: 10, color: "#12262B", marginTop: 3 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#4A5E64" },
});

export type PlanPdfData = {
  companyName: string;
  eventName: string;
  title: string;
  first_project: string;
  metric: string;
  baseline: string;
  target: string;
  recommendation: string;
  risks: string;
  version: number;
  dateText: string;
};

export function PlanDoc({ d }: { d: PlanPdfData }) {
  return (
    <Document title={`${d.companyName} AI starter plan`} author="ARM Hub">
      <Page size="A4" style={s.page}>
        <Text style={s.eyebrow}>ARM Hub AI Adopt · AI starter plan</Text>
        <Text style={s.company}>{d.companyName}</Text>
        <Text style={s.title}>{d.title || "Your AI starter plan"}</Text>
        <View style={s.rule} />
        <Text style={s.h}>Your first project</Text>
        <Text>{d.first_project || "To be agreed."}</Text>
        <Text style={s.h}>How you will know it worked</Text>
        <View style={s.measures}>
          <View style={s.measure}>
            <Text style={s.mLabel}>Measure</Text>
            <Text style={s.mValue}>{d.metric || "To be agreed"}</Text>
          </View>
          <View style={s.measure}>
            <Text style={s.mLabel}>Today</Text>
            <Text style={s.mValue}>{d.baseline || "To be measured"}</Text>
          </View>
          <View style={s.measure}>
            <Text style={s.mLabel}>Target</Text>
            <Text style={s.mValue}>{d.target || "To be set"}</Text>
          </View>
        </View>
        <Text style={s.h}>Our recommendation</Text>
        <Text>{d.recommendation}</Text>
        {d.risks ? (
          <>
            <Text style={s.h}>Risks and how to manage them</Text>
            <Text>{d.risks}</Text>
          </>
        ) : null}
        <View style={s.footer} fixed>
          <Text>{d.eventName}</Text>
          <Text>
            Version {d.version} · {d.dateText}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
