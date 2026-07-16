// Decompile one or more functions by address from a headless Ghidra project.
// Usage: -postScript DecompileFunctions.java 0000:9123 0000:690b

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;

public class DecompileFunctions extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] arguments = getScriptArgs();
        if (arguments.length == 0) {
            throw new IllegalArgumentException("pass at least one function address");
        }

        DecompInterface decompiler = new DecompInterface();
        decompiler.toggleCCode(true);
        decompiler.toggleSyntaxTree(false);
        if (!decompiler.openProgram(currentProgram)) {
            throw new IllegalStateException("could not initialize decompiler");
        }

        try {
            for (String addressText : arguments) {
                Address address = currentProgram.getAddressFactory().getAddress(addressText);
                if (address == null) {
                    println("=== " + addressText + " (invalid address) ===");
                    continue;
                }
                Function function = getFunctionContaining(address);
                if (function == null) {
                    function = getFunctionAt(address);
                }
                if (function == null) {
                    println("=== " + addressText + " (no function) ===");
                    continue;
                }

                println("=== " + addressText + " -> " + function.getName() +
                    " @ " + function.getEntryPoint() + " ===");
                DecompileResults result = decompiler.decompileFunction(
                    function, 60, monitor);
                if (!result.decompileCompleted()) {
                    println("DECOMPILE FAILED: " + result.getErrorMessage());
                    continue;
                }
                println(result.getDecompiledFunction().getC());
            }
        }
        finally {
            decompiler.dispose();
        }
    }
}
