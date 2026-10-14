import sys, json, os
import win32com.client as w
path = os.path.abspath(sys.argv[1])
xl = w.DispatchEx('Excel.Application'); xl.Visible = False; xl.DisplayAlerts = False
wb = xl.Workbooks.Open(path)
def fill(sheet, answers, header=None):
    ws = wb.Worksheets(sheet)
    for cell, v in answers.items(): ws.Range(cell).Value = v
    if header:
        for cell, v in header.items(): ws.Range(cell).Value = v
ALL_ANSWER_CELLS = ["M10","M11","M12","M13","M14","M15","M18","M19","M20","M21","M22","M23","M24","M26","M27","M28","M30","M31","M36","M38","M39","M40","M41","M43","M44","M45","M46","M47","M49","M51","M52","M57","M58","M59","M60","M64"]
perfect = {c: "Y" for c in ALL_ANSWER_CELLS}; perfect.update({"M21":"N","M43":"N","M58":"N"})
fill("Task1", perfect, {"C3":"Perfect Customer","C4":"HVAC","C5":"7/6/2026","C6":"1 Main St","C7":"J-1"})
fill("Task2", {"M11":"Y","M36":"Y","M43":"Y","M44":"N","M47":"N","M58":"Y","M64":"Y"})        # all four failures, completed
fill("Task3", {"M11":"Y","M21":"Y"})                                                            # declined quote
fill("Task4", {"M11":"Y","M36":"Y"})                                                            # in progress only
fill("Task5", {"M11":"y","M36":"y","M64":"y"})                                                  # lower-case
fill("Task6", {"M11":"Y","M36":"Y","M60":"B","M64":"Y","M58":"Y"})                              # callback occurred, B at step 33
fill("Task7", {"M11":"Y","M36":"Y","M44":"N","M64":"Y"})                                        # one failure (QA/QC), completed
fill("Task8", {"M11":"Y","M36":"Y","M64":"Y","M43":"N","M44":"Y","M47":"Y","M58":"N"})          # explicit N on fail-if-Y steps
fill("CALLBACK1", perfect)                                                                      # should NOT count in monthly
xl.CalculateFull()
out = {}
for s in ["Task1","Task2","Task3","Task4","Task5","Task6","Task7","Task8","Task9","CALLBACK1"]:
    ws = wb.Worksheets(s)
    out[s] = {k: ws.Range(k).Value for k in ["C81","C82","C83","C86","C87","C88","C89","C90","C91","C94","C95","M71","M72","M73","M74","M75","M76"]}
wp = wb.Worksheets("Employee Production (Monthly)")
out["Monthly"] = {k: (wp.Range(k).Text if isinstance(wp.Range(k).Value, int) and False else wp.Range(k).Value) for k in ["D9","D10","D11","D14","D15","D16","D17","B20","B21","B22","B23"]}
out["Monthly_text"] = {k: wp.Range(k).Text for k in ["D14","D15","D16","D17","B23"]}
wj = wb.Worksheets("JobLog")
out["JobLog_row4"] = {k: wj.Range(k).Text for k in ["B4","C4","D4","E4","F4","G4"]}
wb.SaveAs(path.replace(".xlsx","_filled.xlsx")); wb.Close(False); xl.Quit()
print(json.dumps(out, indent=1, default=str))
