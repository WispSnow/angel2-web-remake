// Avoids decompiler address overflows in the module-offset companion view.
// @category Angel2

import ghidra.app.script.GhidraScript;

public class ConfigureModuleOffsetAnalysis extends GhidraScript {
    @Override
    protected void run() throws Exception {
        setAnalysisOption(currentProgram, "Decompiler Parameter ID", "false");
        setAnalysisOption(currentProgram, "Decompiler Switch Analysis", "false");
        println("Disabled decompiler-based analyzers for module-offset analysis");
    }
}
