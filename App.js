import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StripeProvider } from "@stripe/stripe-react-native";
import { StatusBar } from "expo-status-bar";

import { AuthProvider } from "./src/context/AuthContext";
import BirthDetailsScreen from "./src/screens/BirthDetailsScreen";
import LoginScreen from "./src/screens/LoginScreen";
import PaymentScreen from "./src/screens/PaymentScreen";
import ReportScreen from "./src/screens/ReportScreen";

// Publishable key only (never put your Stripe SECRET key in the app) —
// get this from https://dashboard.stripe.com/apikeys after creating a Stripe account.
const STRIPE_PUBLISHABLE_KEY = "pk_test_REPLACE_ME";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} merchantIdentifier="merchant.com.suchi.venusreport">
      <AuthProvider>
        <StatusBar style="dark" />
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="BirthDetails"
            screenOptions={{
              headerStyle: { backgroundColor: "#fdf6ec" },
              headerTintColor: "#c76b8a",
              headerTitleStyle: { fontWeight: "bold" },
            }}
          >
            <Stack.Screen name="BirthDetails" component={BirthDetailsScreen} options={{ title: "Venus Report" }} />
            <Stack.Screen name="Login" component={LoginScreen} options={{ title: "Log In" }} />
            <Stack.Screen name="Payment" component={PaymentScreen} options={{ title: "Unlock Report" }} />
            <Stack.Screen name="Report" component={ReportScreen} options={{ title: "Your Report" }} />
          </Stack.Navigator>
        </NavigationContainer>
      </AuthProvider>
    </StripeProvider>
  );
}
