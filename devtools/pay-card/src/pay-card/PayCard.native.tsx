import { ScrollView, View } from "react-native";
import { Box, Button, Divider, Tag, Text } from "@ledgerhq/lumen-ui-rnative";
import type { PayCardToolProps } from "../types";
import { Section } from "../components/Section/Section";
import { ToggleRow } from "../components/ToggleRow/ToggleRow";
import { EnvVarRow } from "../components/EnvVarRow/EnvVarRow";
import { AuthSection } from "./AuthSection";
import { ResultToast } from "./ResultToast";

const BUTTON_ROW_STYLE = {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 8,
} as const;
const PANEL_STYLE = { flex: 1 } as const;

export function PayCard(props: Readonly<PayCardToolProps>) {
  const { flags, onboarding, hasSeenFeatureTour, resetPayCardFeatureTourSeen, env, auth } = props;

  return (
    <View style={PANEL_STYLE}>
      <ScrollView>
        {auth ? (
          <>
            <AuthSection auth={auth} />
            <Divider />
          </>
        ) : null}

        <Section title="Feature flags">
          <ToggleRow
            label="Pay tab"
            description="lwdPayTab / lwmPayTab"
            checked={flags.payTabEnabled}
            onChange={flags.setPayTabEnabled}
          />
          <ToggleRow
            label="Card param"
            description="params.card"
            checked={flags.cardParam}
            onChange={flags.setCardParam}
          />
          <ToggleRow
            label="Legacy Card"
            description="ptxCard"
            checked={flags.ptxCardEnabled}
            onChange={flags.setPtxCardEnabled}
          />
        </Section>

        <Divider />

        <Section title="Onboarding">
          <Box lx={{ flexDirection: "column", gap: "s8" }}>
            {onboarding.steps.map(step => (
              <ToggleRow
                key={step.id}
                label={step.label}
                checked={step.done}
                onChange={() => onboarding.setStepDone(step.id, !step.done)}
              />
            ))}
          </Box>
        </Section>

        <Divider />

        <Section title="Reset onboarding">
          <Box style={BUTTON_ROW_STYLE}>
            <Button
              appearance="gray"
              size="sm"
              onPress={() => onboarding.setStepDone("all", false)}
            >
              Reset onboarding widget
            </Button>
          </Box>
        </Section>

        <Divider />

        <Section title="Feature tour">
          <Box style={BUTTON_ROW_STYLE}>
            <Tag
              size="sm"
              appearance={hasSeenFeatureTour ? "success" : "gray"}
              label={hasSeenFeatureTour ? "Seen" : "Not seen"}
            />
          </Box>
          <Box style={BUTTON_ROW_STYLE}>
            <Button appearance="gray" size="sm" onPress={resetPayCardFeatureTourSeen}>
              Reset feature tour
            </Button>
          </Box>
        </Section>

        <Divider />

        <Section title="Env vars">
          <Text typography="body4" lx={{ color: "muted" }}>
            Applied at once, and not saved: a restart brings the build's values back.
          </Text>
          {env.vars.map(envVar => (
            <EnvVarRow key={envVar.key} envVar={envVar} onSet={env.setVar} />
          ))}
        </Section>
      </ScrollView>
      {auth ? <ResultToast result={auth.lastResult} /> : null}
    </View>
  );
}

export default PayCard;
