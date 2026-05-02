import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './HomeScreen';
import GuidanceScreen from './GuidanceScreen';
import IncidentLogScreen from './IncidentLogScreen';
import SMSComposeScreen from './SMSComposeScreen';
import CameraScreen from './CameraScreen';

const Stack = createNativeStackNavigator();

export default function Navigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Camera" component={CameraScreen} />
        <Stack.Screen name="Guidance" component={GuidanceScreen} />
        <Stack.Screen name="IncidentLog" component={IncidentLogScreen} />
        <Stack.Screen name="SMSCompose" component={SMSComposeScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
