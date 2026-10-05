import pandas as pd
import json
import sys

def analyze_excel_file(file_path):
    """Analyze Excel file structure and content"""
    print(f"\n{'='*80}")
    print(f"Analyzing: {file_path}")
    print(f"{'='*80}\n")
    
    try:
        # Get all sheet names
        excel_file = pd.ExcelFile(file_path)
        sheet_names = excel_file.sheet_names
        print(f"Number of sheets: {len(sheet_names)}")
        print(f"Sheet names: {sheet_names}\n")
        
        analysis = {
            'file_name': file_path,
            'sheets': {}
        }
        
        # Analyze each sheet
        for sheet_name in sheet_names:
            print(f"\n--- Sheet: {sheet_name} ---")
            df = pd.read_excel(file_path, sheet_name=sheet_name)
            
            print(f"Dimensions: {df.shape[0]} rows x {df.shape[1]} columns")
            print(f"\nColumns ({len(df.columns)}):")
            for i, col in enumerate(df.columns, 1):
                print(f"  {i}. {col}")
            
            print(f"\nData types:")
            for col in df.columns:
                print(f"  {col}: {df[col].dtype}")
            
            print(f"\nFirst 3 rows preview:")
            print(df.head(3).to_string())
            
            print(f"\nBasic statistics:")
            print(f"  Total rows: {len(df)}")
            print(f"  Non-null counts per column:")
            for col in df.columns:
                non_null = df[col].notna().sum()
                print(f"    {col}: {non_null}/{len(df)} ({100*non_null/len(df):.1f}%)")
            
            # Store analysis
            analysis['sheets'][sheet_name] = {
                'rows': df.shape[0],
                'columns': df.shape[1],
                'column_names': list(df.columns),
                'dtypes': {col: str(dtype) for col, dtype in df.dtypes.items()},
                'sample_data': df.head(5).to_dict('records')
            }
        
        return analysis
        
    except Exception as e:
        print(f"Error analyzing {file_path}: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

# Analyze both files
file1 = "/workspace/uploads/EVA_Final_08_________af5b.xlsx"
file2 = "/workspace/uploads/CA_Sep_26_6d04.xlsx"

analysis1 = analyze_excel_file(file1)
analysis2 = analyze_excel_file(file2)

# Save detailed analysis to JSON
if analysis1:
    with open('/workspace/analysis_eva.json', 'w', encoding='utf-8') as f:
        json.dump(analysis1, f, indent=2, ensure_ascii=False, default=str)
    print(f"\n\nDetailed analysis saved to: /workspace/analysis_eva.json")

if analysis2:
    with open('/workspace/analysis_ca.json', 'w', encoding='utf-8') as f:
        json.dump(analysis2, f, indent=2, ensure_ascii=False, default=str)
    print(f"Detailed analysis saved to: /workspace/analysis_ca.json")

print("\n" + "="*80)
print("Analysis complete!")
print("="*80)
