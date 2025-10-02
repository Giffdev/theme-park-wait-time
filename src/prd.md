# ParkFlow - Smart Theme Park Wait Time Reporting

## Core Purpose & Success
**Mission Statement**: Help theme park visitors make informed decisions through real-time wait time reporting and crowd analytics to optimize their park experience.

**Success Indicators**: Users successfully plan their park visits, spend less time waiting in lines, and contribute accurate wait time data to help the community.

**Experience Qualities**: Real-time, Community-driven, Informative

## Project Classification & Approach
**Complexity Level**: Light Application (multiple features with basic state, user accounts, reporting functionality)

**Primary User Activity**: Acting and Contributing - Users consume wait time data and actively contribute by reporting current wait times

## Navigation Structure
**Home Page** (`/`): 
- Live park overview organized by park family (Disney World, Universal Orlando, etc.)
- Featured parks with current wait times and trend graphs
- Primary entry point for park selection

**Parks Page** (`/parks`):
- Comprehensive park selector organized by resort families
- Complete list of all supported parks across the United States
- Quick access to any park without navigating through home page

**Park Details Page** (`/park/:parkId`):
- Detailed view for a specific park
- Live wait times with reporting functionality  
- Crowd calendar and historical analytics
- Park selector to switch between parks
- Back navigation to previous page

**Attraction Details Page** (`/park/:parkId/attraction/:attractionId`):
- Detailed analytics for individual attractions
- Historical wait time trends with interactive charts
- Peak time analysis and recommendations
- Quick wait time reporting functionality
  - **One active timer policy**: Only one attraction timer can run at a time to prevent confusion
- **Session management** with save/cancel functionality

**My Ride Logs Page** (`/my-logs`):
- **Dual view modes**: Trip-based view and All Rides aggregate view
- **Trip management** with ability to view details, expand/collapse, and delete trips
- **Cross-park trip display** showing multiple parks visited on the same date
- **Advanced search and filtering** by park, attraction type, or content
- **Statistics dashboard** showing total rides, parks visited, and total trips
- **Historical timeline** sorted by visit date with detailed breakdowns
- **Trip details** showing parks visited, ride counts per park, and individual attraction logs

## Essential Features

### Live Park Overview (Home Page)
- **What**: Grid of cards organized by park families (Disney World, Universal Orlando, etc.) showing current wait times and mini trend graphs
- **Why**: Gives users immediate overview of major parks grouped logically to make initial selection decisions
- **Success Criteria**: Users can quickly compare parks within families and navigate to detailed views

### Park Family Organization
- **What**: Parks grouped by resort/operator families (Disney World: 4 theme parks + 2 water parks, Universal Orlando: 3 theme parks + 1 water park, etc.)
- **Why**: Reflects real-world park relationships and visitor decision-making patterns
- **Success Criteria**: Intuitive navigation that matches how users think about park visits

### Comprehensive Park Coverage
- **What**: Support for major US theme park destinations including Disney World, Disneyland, Universal Orlando/Hollywood, Six Flags, Cedar Point, Knott's Berry Farm
- **Why**: Provides value to visitors across the country, not just Orlando-focused
- **Success Criteria**: Accurate data for diverse park types and regions

### Park Details Navigation
- **What**: Dedicated page for each park with comprehensive details and tools
- **Why**: Focused experience for planning and reporting within a specific park
- **Success Criteria**: Seamless navigation between parks while maintaining context

### Real-time Wait Time Reporting
- **What**: Crowd-sourced reporting system where logged-in users can submit current wait times
- **Why**: Community-driven accuracy and fresh data 
- **Success Criteria**: High user participation and data accuracy through verification

### Quick Wait Time Reporting
- **What**: Simplified modal interface for quickly reporting wait times directly from attraction detail pages
- **Why**: Reduces friction for contributing wait time data 
- **Success Criteria**: Increased wait time reports with minimal user effort

### Historical Analytics & Trends
- **What**: Visual graphs showing wait time patterns throughout days, weeks, and seasons
- **Why**: Helps users plan optimal visit times
- **Success Criteria**: Clear, actionable insights that influence user planning decisions

### User Authentication & Gamification
- **What**: User accounts with contribution tracking and reputation system
- **Why**: Encourages accurate reporting and builds community trust
- **Success Criteria**: Active user base contributing regular updates

### Seasonal and Historical Attraction Management
- **What**: Separate organization of active rides, seasonal events (Halloween, Christmas), and defunct/historical attractions
- **Why**: Allows users to log experiences from different time periods and seasonal visits
- **Success Criteria**: Clear categorization that helps users find relevant attractions for their visit timing

### Visit Session Management
- **What**: Ability to start a "park visit" for a specific date and continuously add rides throughout the day
- **Why**: Provides structure for day-long logging and creates meaningful visit records
- **Success Criteria**: Seamless experience for adding rides during a park visit with easy session management

## Design Direction

### Visual Tone & Identity
**Emotional Response**: The design should evoke trust, efficiency, and excitement about theme park experiences.

**Design Personality**: Clean and modern with subtle playful elements that reference theme park magic without being childish.

**Visual Metaphors**: Clean data visualization, smooth transitions that mirror the flow of crowds, subtle theme park references through color and iconography.

**Simplicity Spectrum**: Minimal interface that lets data shine, with progressive disclosure of advanced features.

### Color Strategy
**Color Scheme Type**: Custom palette with purposeful color assignments

**Primary Color**: Deep Ocean Blue (`oklch(0.45 0.15 230)`) - Conveys trust and reliability for data
**Secondary Color**: Warm Coral (`oklch(0.65 0.12 25)`) - Friendly highlights and secondary actions  
**Accent Color**: Vibrant Orange (`oklch(0.70 0.18 50)`) - Call-to-action buttons and important alerts
**Success Color**: Sage Green (`oklch(0.55 0.08 140)`) - Positive feedback and low wait times

**Color Psychology**: Blue establishes trust for data accuracy, coral adds warmth to encourage community participation, orange drives action for reporting, green provides positive reinforcement.

**Foreground/Background Pairings**: 
- Background (`oklch(1 0 0)`) with Foreground (`oklch(0.15 0 0)`) - 15.4:1 contrast ratio ✓
- Card (`oklch(0.98 0 0)`) with Card Foreground (`oklch(0.15 0 0)`) - 14.8:1 contrast ratio ✓
- Primary with Primary Foreground (white) - High contrast for buttons ✓

### Typography System
**Font Pairing Strategy**: Single font family (Inter) with varied weights and sizes for hierarchy

**Typographic Hierarchy**: 
- Headlines: 2xl-4xl, font-bold
- Subheadings: xl-2xl, font-semibold  
- Body: base, font-normal
- Captions: sm, font-medium with muted color

**Font Personality**: Inter provides modern, highly legible characteristics perfect for data-heavy applications

**Which fonts**: Inter from Google Fonts - excellent for data display with multiple weights available

### Visual Hierarchy & Layout
**Attention Direction**: Cards and data visualizations draw primary attention, navigation and controls are secondary

**White Space Philosophy**: Generous spacing around data elements to reduce cognitive load and improve scanability

**Grid System**: Container-based layout with responsive grid for park cards and flexible layout for detailed views

**Component Hierarchy**: 
- Primary: Wait time displays, trend graphs
- Secondary: Park selection, navigation  
- Tertiary: User actions, metadata

### Animations
**Purposeful Meaning**: Smooth transitions between pages maintain spatial context, data updates animate to show live changes

**Hierarchy of Movement**: Graph updates and live data changes get subtle animation priority, navigation transitions are secondary

### UI Elements & Component Selection
**Component Usage**: 
- Cards for park overviews with embedded mini-charts
- Tabs for organizing park detail views
- Buttons with clear hierarchy (Primary for reporting, Secondary for navigation)
- Forms for wait time submissions with real-time validation

**Component States**: All interactive elements have hover, active, and focus states with smooth transitions

**Mobile Adaptation**: Cards stack vertically, tabs convert to dropdown on mobile, touch-friendly button sizing

## Implementation Considerations
**Routing Structure**: React Router with clean URLs (`/park/universal-orlando`)
**State Management**: useKV for persistent data, useState for UI state
**Data Flow**: Crowd-sourced submissions stored and aggregated for display
**Real-time Updates**: Live data refresh and community verification system