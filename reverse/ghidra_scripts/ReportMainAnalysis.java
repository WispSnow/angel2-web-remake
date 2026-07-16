// Prints a compact summary of the recovered ANGEL2 main image.
// @category Angel2

import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.mem.MemoryBlock;
import ghidra.program.model.symbol.Reference;

public class ReportMainAnalysis extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        String entryText = args.length > 0 ? args[0] : "0FB8:0000";
        println("Program: " + currentProgram.getName());

        for (MemoryBlock block : currentProgram.getMemory().getBlocks()) {
            println("Block " + block.getName() + ": " + block.getStart() + ".." +
                block.getEnd() + " (" + block.getSize() + " bytes)");
        }

        int instructionCount = 0;
        InstructionIterator instructions =
            currentProgram.getListing().getInstructions(true);
        while (instructions.hasNext()) {
            instructions.next();
            instructionCount++;
        }

        int functionCount = 0;
        FunctionIterator functions = currentProgram.getFunctionManager().getFunctions(true);
        while (functions.hasNext()) {
            Function function = functions.next();
            if (functionCount < 32) {
                println("Function " + function.getEntryPoint() + " " + function.getName());
            }
            functionCount++;
        }

        println("Instructions: " + instructionCount);
        println("Functions: " + functionCount);

        Instruction entry = getInstructionAt(
            currentProgram.getAddressFactory().getAddress(entryText));
        if (entry == null) {
            println("No instruction at requested report entry " + entryText);
            return;
        }
        int shown = 0;
        while (entry != null && shown < 24) {
            println(entry.getAddress() + "  " + entry);
            for (Reference reference : entry.getReferencesFrom()) {
                println("  -> " + reference.getToAddress() + " " +
                    reference.getReferenceType());
            }
            entry = entry.getNext();
            shown++;
        }
    }
}
