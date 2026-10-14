import { DemoCallScreen } from '@/features/call/DemoCallScreen';
import { DollCallScreen } from '@/features/call/DollCallScreen';
import { IS_DEMO } from '@/lib/demo-api';

export default IS_DEMO ? DemoCallScreen : DollCallScreen;
