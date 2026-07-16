// Prints disassembly, flow references, and decompiler output for one function.
// @category Angel2

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileOptions;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.symbol.Reference;

public class ReportFunction extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length == 0) {
            throw new IllegalArgumentException("Expected a segmented function address");
        }

        Address address = currentProgram.getAddressFactory().getAddress(args[0]);
        Function function = getFunctionAt(address);
        if (function == null) {
            function = getFunctionContaining(address);
        }
        if (function == null) {
            throw new IllegalArgumentException("No function at " + args[0]);
        }

        println("FUNCTION " + function.getName() + " " + function.getEntryPoint() +
            " body=" + function.getBody());

        InstructionIterator instructions =
            currentProgram.getListing().getInstructions(function.getBody(), true);
        while (instructions.hasNext()) {
            Instruction instruction = instructions.next();
            println("  " + instruction.getAddress() + "  " + instruction);
            for (Reference reference : instruction.getReferencesFrom()) {
                if (reference.getReferenceType().isFlow()) {
                    println("    -> " + reference.getToAddress() + " " +
                        reference.getReferenceType());
                }
            }
        }

        DecompInterface decompiler = new DecompInterface();
        try {
            decompiler.setOptions(new DecompileOptions());
            decompiler.toggleCCode(true);
            decompiler.setSimplificationStyle("decompile");
            if (!decompiler.openProgram(currentProgram)) {
                println("DECOMPILE ERROR: " + decompiler.getLastMessage());
                return;
            }
            DecompileResults result = decompiler.decompileFunction(function, 60, monitor);
            if (!result.decompileCompleted() || result.getDecompiledFunction() == null) {
                println("DECOMPILE ERROR: " + result.getErrorMessage());
                return;
            }
            println("DECOMPILED\n" + result.getDecompiledFunction().getC());
        }
        finally {
            decompiler.dispose();
        }
    }
}
