import pandas as pd
import json

def analyze_eva_file():
    """Analyze EVA (Evaluation) file - Russia Bonus KPIs"""
    print("="*80)
    print("EVA_Final_08 - RUSSIA BONUS KPIs & RATING")
    print("="*80)
    
    # Read with proper header detection
    df_kpis = pd.read_excel('/workspace/uploads/EVA_Final_08_________af5b.xlsx', 
                            sheet_name='Russia_Bonus KPIs', 
                            header=2)  # Headers are in row 3
    
    print("\n📊 RUSSIA BONUS KPIs SHEET:")
    print(f"Total records: {len(df_kpis)}")
    print(f"\nColumns identified:")
    for i, col in enumerate(df_kpis.columns[:20], 1):  # Show first 20
        print(f"  {i}. {col}")
    
    # Sample data
    print(f"\n📋 Sample data (first 5 rows):")
    pd.set_option('display.max_columns', 10)
    pd.set_option('display.width', 200)
    print(df_kpis.head())
    
    # Key metrics
    print(f"\n📈 Key Metrics Found:")
    key_cols = [col for col in df_kpis.columns if any(kw in str(col).lower() 
                for kw in ['kpi', 'score', 'rating', 'bonus', 'incentive', 'call rate', 
                          'route coverage', 'posm', 'sku', 'penalty'])]
    for col in key_cols[:15]:
        print(f"  • {col}")
    
    # Rating sheet
    df_rating = pd.read_excel('/workspace/uploads/EVA_Final_08_________af5b.xlsx', 
                              sheet_name='Rating 08',
                              header=1)
    
    print(f"\n\n📊 RATING 08 SHEET:")
    print(f"Total records: {len(df_rating)}")
    print(f"\nColumns identified:")
    for i, col in enumerate(df_rating.columns[:15], 1):
        print(f"  {i}. {col}")
    
    print(f"\n📋 Sample data:")
    print(df_rating.head())
    
    # Analyze roles
    print(f"\n👥 Roles identified:")
    if 'Region' in df_rating.columns:
        regions = df_rating['Region'].value_counts().head(10)
        print(f"\nTop Regions:\n{regions}")
    
    return df_kpis, df_rating


def analyze_ca_file():
    """Analyze CA (Calendar Activities) file"""
    print("\n\n" + "="*80)
    print("CA_Sep_26 - CALENDAR & ACTIVITIES")
    print("="*80)
    
    # Read main sheet
    df_ca = pd.read_excel('/workspace/uploads/CA_Sep_26_6d04.xlsx', 
                         sheet_name="СА June'26",
                         header=1)
    
    print(f"\n📅 CALENDAR ACTIVITIES SHEET:")
    print(f"Total records: {len(df_ca)}")
    
    # Identify structure
    print(f"\nFirst columns:")
    for i, col in enumerate(df_ca.columns[:10], 1):
        print(f"  {i}. {col}")
    
    # Sample data
    print(f"\n📋 Sample data:")
    print(df_ca.head(10))
    
    # Check if there's employee/territory data
    if 'Region' in df_ca.columns:
        print(f"\nRegions: {df_ca['Region'].nunique()}")
    
    # Reference data sheet
    try:
        df_ref = pd.read_excel('/workspace/uploads/CA_Sep_26_6d04.xlsx', 
                              sheet_name='Sheet2')
        print(f"\n\n📊 REFERENCE DATA (Sheet2):")
        print(df_ref)
    except:
        pass
    
    return df_ca


def generate_summary():
    """Generate comprehensive summary"""
    print("\n\n" + "="*80)
    print("📊 COMPREHENSIVE ANALYSIS SUMMARY")
    print("="*80)
    
    summary = {
        "EVA_Final_08": {
            "purpose": "Employee Performance Evaluation & Bonus System",
            "description": "Tracks KPIs and ratings for sales representatives across Russia",
            "key_metrics": [
                "Summary Score",
                "Call Rate",
                "Route Coverage",
                "POSM (Point of Sale Materials) placement",
                "SKU (Stock Keeping Unit) contract compliance",
                "Final KPI Score",
                "Incentive Rate",
                "Tour Penalty"
            ],
            "roles": ["TSM (Territory Sales Manager)", "BDM (Business Development Manager)", 
                     "RKAM (Regional Key Account Manager)"],
            "geography": "Russian regions and territories",
            "data_volume": "~187 employee records"
        },
        "CA_Sep_26": {
            "purpose": "Activity Calendar & Planning",
            "description": "Monthly calendar tracking meetings, weekends, and activity approvals",
            "key_features": [
                "Calendar with MM (monthly meetings) and W (weekends) markers",
                "Approval workflow with BUM (Business Unit Manager) sign-offs",
                "Territory and position tracking",
                "Time allocation for activities"
            ],
            "data_volume": "~185 records",
            "reference_data": "Car service types, incidents tracking"
        },
        "integration_potential": {
            "common_dimensions": [
                "Region",
                "Territory",
                "Position/Role (TSM, BDM)",
                "Time period"
            ],
            "analysis_opportunities": [
                "Correlate activity planning with KPI performance",
                "Track how calendar utilization affects sales metrics",
                "Monitor approval workflows and their impact on results",
                "Regional performance comparison",
                "Role-based performance analysis"
            ]
        }
    }
    
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    
    # Save to file
    with open('/workspace/data_analysis_summary.json', 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    
    print("\n\n💡 DASHBOARD RECOMMENDATIONS:")
    print("""
    1. EXECUTIVE DASHBOARD
       - Overall KPI performance by region
       - Top/bottom performers
       - Bonus payout projections
       - Regional comparison heatmap
    
    2. OPERATIONAL DASHBOARD
       - Call rate trends
       - Route coverage efficiency
       - POSM/SKU compliance rates
       - Activity calendar utilization
    
    3. MANAGER DASHBOARD
       - Team performance overview
       - Approval workflow status
       - Individual employee KPI tracking
       - Penalty and incentive breakdown
    
    4. PLANNING DASHBOARD
       - Calendar optimization
       - Meeting efficiency
       - Territory coverage planning
       - Resource allocation analysis
    
    5. KEY VISUALIZATIONS
       - KPI score distribution (histogram)
       - Performance treemap by region/territory
       - Time series of key metrics
       - Correlation matrix (activity vs performance)
       - Gantt chart for calendar activities
       - Funnel chart for approval workflows
    """)

# Run analysis
try:
    df_kpis, df_rating = analyze_eva_file()
    df_ca = analyze_ca_file()
    generate_summary()
    
    print("\n\n✅ Analysis complete! Summary saved to: /workspace/data_analysis_summary.json")
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
