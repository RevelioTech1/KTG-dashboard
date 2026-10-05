# 🗺️ Data Model & Relationships

## 📊 Entity Relationship Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA ECOSYSTEM                           │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐                    ┌──────────────────┐
│   EVA_Final_08   │                    │   CA_Sep_26      │
│   (Performance)  │◄──────────────────►│   (Planning)     │
└──────────────────┘                    └──────────────────┘
         │                                       │
         │                                       │
         ▼                                       ▼
┌────────────────────────────────────────────────────────────────┐
│                    COMMON DIMENSIONS                           │
├────────────────────────────────────────────────────────────────┤
│  • Region (Регион)                                            │
│  • Territory (Территория)                                      │
│  • Position (Должность: TSM, BDM, RKAM)                       │
│  • Period (Период: месяц, неделя)                             │
│  • Employee Hierarchy (BDM → Territory → TSM)                  │
└────────────────────────────────────────────────────────────────┘
```

## 🏗️ Proposed Data Warehouse Schema

### Star Schema Design

```
                    ┌────────────────────┐
                    │   dim_date         │
                    ├────────────────────┤
                    │ date_id (PK)      │
                    │ date              │
                    │ year              │
                    │ month             │
                    │ week              │
                    │ day_of_week       │
                    │ is_weekend        │
                    │ is_holiday        │
                    └────────────────────┘
                              △
                              │
    ┌────────────────┐        │        ┌────────────────┐
    │ dim_employee   │        │        │ dim_territory  │
    ├────────────────┤        │        ├────────────────┤
    │ employee_id    │        │        │ territory_id   │
    │ employee_name  │        │        │ territory_code │
    │ position       │        │        │ territory_name │
    │ bdm_id         │        │        │ region_id      │
    │ territory_id   │        │        │ region_name    │
    │ hire_date      │        │        │ area           │
    │ is_active      │        │        │ population     │
    └────────────────┘        │        └────────────────┘
              △               │                  △
              │               │                  │
              │    ┌──────────┴──────────┐      │
              │    │                     │      │
              │    ▼                     ▼      │
              └──► ┌─────────────────────────┐ ◄┘
                   │   fact_kpi_performance  │
                   ├─────────────────────────┤
                   │ kpi_id (PK)            │
                   │ date_id (FK)           │
                   │ employee_id (FK)       │
                   │ territory_id (FK)      │
                   │ ─────────────────────  │
                   │ summary_score          │
                   │ call_rate              │
                   │ route_coverage         │
                   │ posm_compliance        │
                   │ sku_contract_pct       │
                   │ sku_noncontract_pct    │
                   │ sku_target_achievement │
                   │ distribution_matching  │
                   │ pos_error_rate         │
                   │ ─────────────────────  │
                   │ final_kpi_score        │
                   │ incentive_rate         │
                   │ tour_penalty           │
                   │ final_incentive_rate   │
                   │ rating_position        │
                   │ is_top_10              │
                   └─────────────────────────┘

              ┌──────────────────┐
              │                  │
              ▼                  ▼
    ┌────────────────────┐    ┌────────────────────┐
    │ fact_activities    │    │ fact_incentive     │
    ├────────────────────┤    ├────────────────────┤
    │ activity_id (PK)   │    │ incentive_id (PK)  │
    │ date_id (FK)       │    │ employee_id (FK)   │
    │ employee_id (FK)   │    │ period_id (FK)     │
    │ ──────────────────│    │ ──────────────────│
    │ activity_type      │    │ base_salary        │
    │ hours_planned      │    │ kpi_multiplier     │
    │ hours_actual       │    │ incentive_amount   │
    │ approval_status    │    │ penalty_amount     │
    │ approved_by        │    │ final_payout       │
    │ approved_date      │    │ payment_status     │
    │ notes              │    │ paid_date          │
    └────────────────────┘    └────────────────────┘
```

## 📊 Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA PIPELINE                               │
└─────────────────────────────────────────────────────────────────────┘

   SOURCE FILES                ETL LAYER              DATA WAREHOUSE
   
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│ EVA_Final    │────────►│              │────────►│              │
│  .xlsx       │  Excel  │   Extract    │  Load   │ PostgreSQL   │
└──────────────┘  Parser │   Transform  │         │   Database   │
                          │   Validate   │         │              │
┌──────────────┐         │              │         │  • Dims      │
│ CA_Sep_26    │────────►│              │────────►│  • Facts     │
│  .xlsx       │         │              │         │  • Aggs      │
└──────────────┘         └──────────────┘         └──────────────┘
                                │                         │
                                │                         │
                                ▼                         ▼
                        ┌──────────────┐         ┌──────────────┐
                        │ Data Quality │         │   BI Layer   │
                        │   Checks     │         │              │
                        │              │         │ • Dashboards │
                        │ • Nulls      │         │ • Reports    │
                        │ • Ranges     │         │ • Alerts     │
                        │ • Duplicates │         │ • Analytics  │
                        └──────────────┘         └──────────────┘
```

## 🔄 Data Update Frequency

```
┌────────────────────┬──────────────┬─────────────────────┐
│ Data Type          │ Frequency    │ Update Method       │
├────────────────────┼──────────────┼─────────────────────┤
│ KPI Performance    │ Weekly       │ File Upload + ETL   │
│ Activity Calendar  │ Daily        │ File Upload + ETL   │
│ Dimensions         │ Monthly      │ Manual/Semi-auto    │
│ Aggregations       │ Daily        │ Scheduled Job       │
│ Dashboard Refresh  │ Hourly       │ Cache Update        │
└────────────────────┴──────────────┴─────────────────────┘
```

## 🎯 Key Metrics Calculation Logic

### 1. Summary Score
```
Summary Score = 
  IF (Type KPI == "30% TOP-10 + 70% KPP")
    THEN (0.3 * TOP_10_Score) + (0.7 * KPP_Score)
  ELSE IF (Type KPI == "100% KPP")
    THEN KPP_Score
  ELSE KPP_Score
```

### 2. Final Incentive Rate
```
Final Incentive Rate = Incentive Rate * (1 - Tour Penalty)

Where:
  Incentive Rate = f(Final KPI Score, Rating Position)
  
  Rating Bands:
    80-90:   5%    90-100:  7.5%   100-110: 9.9%
    110-120: 20%   120-130: 22%    130-140: 24%
    140-150: 26%   150-160: 28%    160-170: 30%
    170-180: 32%   180-190: 34%    190-200: 36%
    200+:    40%
```

### 3. Compliance Metrics
```
POSM_Compliance = 
  (Actual_POSM_Installations / Target_POSM_Installations) * 100

SKU_Contract_Compliance = 
  (Actual_Contract_SKUs / Total_Contract_SKUs) * 100

SKU_NonContract_Compliance = 
  (Actual_NonContract_SKUs / Total_NonContract_SKUs) * 100

Route_Coverage = 
  (Actual_Stores_Visited / Planned_Stores) * 100
```

### 4. Performance Index
```
Performance_Index = 
  (Final_KPI_Score / AVG(Team_KPI_Score)) * 100

Classification:
  > 120: 🌟 Outstanding
  100-120: 🟢 Exceeds Expectations
  80-100: 🟡 Meets Expectations
  < 80: 🔴 Needs Improvement
```

## 📈 Dashboard Query Patterns

### Executive Dashboard Queries

#### 1. Overall Performance Summary
```sql
SELECT 
  COUNT(DISTINCT employee_id) as total_employees,
  AVG(final_kpi_score) as avg_kpi,
  SUM(final_incentive_rate * base_salary) as total_incentive,
  COUNT(CASE WHEN final_kpi_score >= 100 THEN 1 END) / 
    COUNT(*) * 100 as pct_above_target
FROM fact_kpi_performance
WHERE period = CURRENT_PERIOD;
```

#### 2. Regional Comparison
```sql
SELECT 
  t.region_name,
  COUNT(DISTINCT k.employee_id) as team_size,
  AVG(k.final_kpi_score) as avg_score,
  AVG(k.call_rate) as avg_call_rate,
  AVG(k.route_coverage) as avg_coverage
FROM fact_kpi_performance k
JOIN dim_territory t ON k.territory_id = t.territory_id
GROUP BY t.region_name
ORDER BY avg_score DESC;
```

#### 3. Top/Bottom Performers
```sql
SELECT 
  e.employee_name,
  e.position,
  t.territory_name,
  k.final_kpi_score,
  k.rating_position,
  k.final_incentive_rate
FROM fact_kpi_performance k
JOIN dim_employee e ON k.employee_id = e.employee_id
JOIN dim_territory t ON k.territory_id = t.territory_id
WHERE k.period = CURRENT_PERIOD
ORDER BY k.final_kpi_score DESC
LIMIT 10;  -- Top 10
```

### Operational Dashboard Queries

#### 4. Compliance Tracking
```sql
SELECT 
  d.week,
  AVG(k.posm_compliance) as avg_posm,
  AVG(k.sku_contract_pct) as avg_sku_contract,
  AVG(k.sku_noncontract_pct) as avg_sku_noncontract,
  AVG(k.pos_error_rate) as avg_error_rate
FROM fact_kpi_performance k
JOIN dim_date d ON k.date_id = d.date_id
WHERE d.month = CURRENT_MONTH
GROUP BY d.week
ORDER BY d.week;
```

#### 5. Activity Utilization
```sql
SELECT 
  a.activity_type,
  COUNT(*) as occurrences,
  SUM(a.hours_planned) as total_hours_planned,
  SUM(a.hours_actual) as total_hours_actual,
  (SUM(a.hours_actual) / SUM(a.hours_planned)) * 100 as utilization_pct
FROM fact_activities a
WHERE a.period = CURRENT_PERIOD
GROUP BY a.activity_type
ORDER BY total_hours_actual DESC;
```

### Manager Dashboard Queries

#### 6. Team Overview
```sql
SELECT 
  e.employee_name,
  k.final_kpi_score,
  k.final_incentive_rate,
  CASE 
    WHEN k.final_kpi_score >= 100 THEN '🟢 On Target'
    WHEN k.final_kpi_score >= 80 THEN '🟡 Attention'
    ELSE '🔴 Risk'
  END as status
FROM fact_kpi_performance k
JOIN dim_employee e ON k.employee_id = e.employee_id
WHERE e.bdm_id = CURRENT_USER_ID
  AND k.period = CURRENT_PERIOD
ORDER BY k.final_kpi_score DESC;
```

## 🔗 Data Lineage

```
SOURCE SYSTEMS → STAGING → TRANSFORMATION → DATA WAREHOUSE → DASHBOARDS

EVA_Final_08.xlsx
  ├─► stg_kpi_raw
  │     └─► Transform (clean, validate, parse)
  │           └─► fact_kpi_performance
  │                 └─► agg_kpi_daily
  │                       └─► agg_kpi_weekly
  │                             └─► agg_kpi_monthly
  │                                   └─► Dashboard Views
  │
  └─► dim_employee (upsert)
      dim_territory (upsert)

CA_Sep_26.xlsx
  └─► stg_activities_raw
        └─► Transform (pivot, normalize)
              └─► fact_activities
                    └─► agg_activities_daily
                          └─► Dashboard Views
```

## 🔐 Data Governance

### Data Quality Rules

```
┌─────────────────┬──────────────────────────────────────────┐
│ Rule Type       │ Description                              │
├─────────────────┼──────────────────────────────────────────┤
│ Completeness    │ • No NULLs in mandatory fields          │
│                 │ • Employee must exist in dim_employee    │
│                 │ • Territory must exist in dim_territory  │
├─────────────────┼──────────────────────────────────────────┤
│ Validity        │ • KPI scores: 0 - 250                   │
│                 │ • Percentages: 0 - 100                   │
│                 │ • Dates: Valid date format               │
├─────────────────┼──────────────────────────────────────────┤
│ Consistency     │ • Final = Base * (1 - Penalty)          │
│                 │ • Sum of type % = 100                    │
├─────────────────┼──────────────────────────────────────────┤
│ Timeliness      │ • Data age < 7 days                     │
│                 │ • No future dates                        │
├─────────────────┼──────────────────────────────────────────┤
│ Uniqueness      │ • One record per employee per period    │
│                 │ • No duplicate employee IDs              │
└─────────────────┴──────────────────────────────────────────┘
```

### Access Control Matrix

```
┌──────────────┬──────────┬────────────┬──────────┬──────────┐
│ Role         │ Read All │ Read Team  │ Write    │ Admin    │
├──────────────┼──────────┼────────────┼──────────┼──────────┤
│ Executive    │    ✅    │     ✅     │    ❌    │    ❌    │
│ Regional Mgr │    ✅    │     ✅     │    ❌    │    ❌    │
│ BDM          │    ❌    │     ✅     │    ❌    │    ❌    │
│ TSM          │    ❌    │     ❌     │    ❌    │    ❌    │
│ HR/Finance   │    ✅    │     ✅     │    ❌    │    ❌    │
│ Data Admin   │    ✅    │     ✅     │    ✅    │    ✅    │
└──────────────┴──────────┴────────────┴──────────┴──────────┘

Note: TSM can only view their own data
```

## 📊 Aggregation Strategy

### Pre-aggregated Tables for Performance

```sql
-- Daily Aggregations (refresh: hourly)
CREATE TABLE agg_kpi_daily AS
SELECT 
  date_id,
  territory_id,
  position,
  AVG(final_kpi_score) as avg_kpi,
  MIN(final_kpi_score) as min_kpi,
  MAX(final_kpi_score) as max_kpi,
  COUNT(*) as employee_count
FROM fact_kpi_performance
GROUP BY date_id, territory_id, position;

-- Monthly Aggregations (refresh: daily)
CREATE TABLE agg_kpi_monthly AS
SELECT 
  year_month,
  region_name,
  AVG(final_kpi_score) as avg_kpi,
  SUM(incentive_amount) as total_incentive,
  COUNT(DISTINCT employee_id) as unique_employees
FROM fact_kpi_performance k
JOIN dim_territory t ON k.territory_id = t.territory_id
GROUP BY year_month, region_name;
```

## 🎯 Integration Points

```
┌──────────────────────────────────────────────────────────────┐
│              EXTERNAL SYSTEM INTEGRATIONS                    │
└──────────────────────────────────────────────────────────────┘

    CRM System                    ERP System
         │                             │
         ├──► Customer data            ├──► Salary data
         ├──► Visit logs               ├──► Contract info
         └──► Sales actuals            └──► Product catalog
                   │                             │
                   └─────────┬───────────────────┘
                             ▼
                   ┌──────────────────┐
                   │  Data Warehouse  │
                   └──────────────────┘
                             │
                   ┌─────────┴─────────┐
                   ▼                   ▼
            ┌────────────┐      ┌────────────┐
            │ Dashboards │      │  Reports   │
            └────────────┘      └────────────┘
                   │                   │
                   └─────────┬─────────┘
                             ▼
                   ┌──────────────────┐
                   │  Email/Slack     │
                   │  Notifications   │
                   └──────────────────┘
```

---

*Data model designed for scalable analytics and management decision-making*
